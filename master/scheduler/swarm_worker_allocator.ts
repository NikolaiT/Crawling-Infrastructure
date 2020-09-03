import {system} from "@lib/misc/shell";
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {got} from 'got';
import {sleep} from '@lib/misc/helpers';
import {IEip, IMachine, IMachineDoc, MachineHandler, MachineStatus, MachineType} from '../src/models/machine.model';
import {ConfigHandler} from "../src/models/config";
import {ICrawlTask, WorkerType} from "../src/models/crawltask.model";
import {Config} from './config';
import {getLogger, Logger} from "@lib/misc/logger";

export enum ClusterSize {
  small = 'small', // t2.small
  medium = 'medium', // t2.medium, 2vCPU, 4G RAM
  larger = 'larger', // t2.large, 2vCPU, 8G RAM
  large = 'large', // t2.xlarge, 4vCPU, 16G RAM
  huge = 'huge', // t2.2xlarge, 8vCPU, 32G RAM
}

export class WorkerAllocator {
  config_handler: any;
  machines: Array<IMachineDoc>;
  dry_run: boolean;
  region: string;
  ami: string;
  security_group_name: string;
  swarm_join_token: string;
  handler: any;
  config: any;
  logger?: Logger;
  setup: boolean;

  /**
   * @param config
   * @param dry_run: whether to print commands instead of executing them
   */
  constructor(config: Config, dry_run=true) {
    this.config = config;
    this.config_handler = new ConfigHandler();
    this.handler = new MachineHandler();
    this.machines = [];
    this.dry_run = dry_run;
    let region_config: any = {
      'us-east-1': {
        ami: 'ami-00a208c7cdba991ea',
        security_group_name: 'docker-machine',
      },
      'us-west-1': {
        ami: 'ami-05f856ae6fd8bc118',
        security_group_name: 'docker-machine',
      },
    };
    this.setup = false;
    this.region = 'us-west-1';
    // https://cloud-images.ubuntu.com/locator/ec2/
    // ubuntu 18.04, hvm:ebs-ssd, us-east-1
    this.ami = region_config[this.region].ami;
    // security group should allow access to app specific port
    this.security_group_name = region_config[this.region].security_group_name;
    this.logger = getLogger(config.logging_root, 'worker_allocator');
  }

  public async setupWorkerAllocator() {
    if (!this.setup) {
      if (!await this.checkSoftwareInstalled()) {
        this.logger.error(`Aborting due to missing software...`);
        process.exit(1);
      }
      this.checkEnv();
      await this.setupAwsProfile();
      this.machines = await this.handler.getMachines();
      this.logger.info(`WorkerAllocator setup in region ${this.region} and ami ${this.ami} with ${this.machines.length} machines`);
      this.setup = true;
    }
  }

  /**
   * This idempotent method does the following:
   *
   * 1. create a AWS EC2 worker instance with `docker-machine`
   * 2. associate an elastic IP
   * 3. make this machine join the swarm
   * 4. assign the label `http-crawler` if the task type is http, else assign the label `crawler`
   *
   * @param worker_type: Either `http` or `browser`
   * @param num_machines: The total number of machines to allocate
   * @param size: the size of the machine to allocate
   *
   * @return: Returns true if crawling machines were successfully allocated and setup.
   */
  public async allocate(worker_type: WorkerType, num_machines: number = 1, size: ClusterSize = ClusterSize.large): Promise<boolean | any> {
    let machine_type = (worker_type === WorkerType.http) ? MachineType.http : MachineType.browser;
    let label: string = (worker_type === WorkerType.browser) ? 'type=crawler' : 'type=http-crawler';
    this.machines = await this.handler.getMachines({type: machine_type});
    this.logger.info(`${this.machines.length} machines of type ${machine_type} are already allocated.`);

    let num_to_alloc = num_machines - this.machines.length;
    if (num_to_alloc <= 0) {
      return true;
    }

    this.logger.info(`Allocating ${num_to_alloc} ${machine_type} machines with size ${size}`);

    for (let num: number = 0; num < num_to_alloc; num++) {

      let eip = await this.config_handler.getElasticIp();
      if (!eip) {
        this.logger.error('Cannot allocate elastic IP, therefore additional machines make no sense.');
        return false;
      }

      let machine: IMachineDoc = null;
      let machine_name = null;

      try {
        machine_name = `CrawlWorker${Date.now()}`;
        machine = await this.allocateMachine(machine_name, size, eip, false, label);
        this.logger.info(`Allocated machine ${machine.name} with size ${machine.size} in region ${machine.region}`);

        if (!await this.associateElasticIp(machine)) {
          this.logger.error('Cannot assign elastic IP: ' + JSON.stringify(eip));
          await this.cleanup(machine);
          break;
        } else {
          this.logger.info(`Assigned elastic ip ${JSON.stringify(eip)} to machine ${machine.name}`);
        }

        // now we need to regenerate certificates
        // because we assigned a different elastic IP
        // see: https://github.com/docker/machine/issues/662
        await this.system(`docker-machine regenerate-certs ${machine.name} --force`);
        this.logger.info(`Regenerated certs for machine ${machine.name}`);

        await this.makeMachineJoinSwarm(machine);

        this.logger.info(`Machine ${machine.name} joined swarm master node ${process.env.MASTER_IP}`);

        if (worker_type === WorkerType.browser) {
          machine.type = MachineType.browser;
        } else if (worker_type === WorkerType.http) {
          machine.type = MachineType.http;
        }

        // wait until machine has joined the swarm, replicated and pulled the worker
        // images. We simply poll the crawling url over http to see if they come online.
        if (!await this.waitUntilServiceOnline(machine)) {
          await this.cleanup(machine);
          return false;
        } else {
          // machine is online and status changes from initial --> running
          machine.status = MachineStatus.running;
        }

        await machine.save();

      } catch (err) {
        this.logger.error(`Failed to allocate worker: ${err}`);
        // cleanup and abort when something goes wrong.
        await this.config_handler.freeElasticIp(eip);
        await this.cleanup(machine);
        return false;
      }
    }

    return true;
  }

  /**
   * Polls service until it is online.
   *
   * @param machine
   */
  private async waitUntilServiceOnline(machine: IMachine) {
    // 3 minutes
    let max_polling_time = 1000 * 60 * 3;
    let waited_so_far = 0;
    let port: number = (machine.type === MachineType.http) ? 4444 : 3333;
    let url = `http://${machine.eip.ip}:${port}/`;

    while (waited_so_far <= max_polling_time) {
      try {
        let response = await this.system(`curl --max-time 5 ${url}`);
        if (response && response.stdout) {
          if (response.stdout.includes('"status": 200')) {
            this.logger.info(`Service ${url} online after ${waited_so_far}ms`);
            return true;
          }
        }
      } catch (err) {
        this.logger.warn(`CrawlWorker not online after ${waited_so_far}ms on url ${url}...`);
      }

      let delay = 10 * 1000;
      await sleep(delay);
      waited_so_far += delay;
    }

    return false;
  }

  private async system(command, response=null, catch_error:boolean=false) {
    this.logger.verbose(command);
    if (!this.dry_run) {
      if (catch_error) {
        try {
          response = await system(command);
        } catch (err) {
          this.logger.error(`Error executing command: ${err}`);
        }
      } else {
        response = await system(command);
      }
      this.logger.debug(JSON.stringify(response.stdout));
    }
    return response;
  }

  /**
   * Get endpoints of all the crawlers.
   *
   * Get only machine endpoints for tasks with matching worker types.
   *
   * Tasks that need a browser will be assigned to crawler machines
   * with support for browser. Http tasks will be assigned to http machines.
   */
  public async getApiEndpoints(worker_type: WorkerType): Promise<Array<string>> {
    let machines = await this.handler.getMachines({
      type: this.worker2MachineType(worker_type),
    });

    let endpoints = [];

    for (let machine of machines) {
      if (machine.type === MachineType.browser) {
        endpoints.push(`http://${machine.eip.ip}:3333`);
      } else {
        endpoints.push(`http://${machine.eip.ip}:4444`);
      }
    }

    return endpoints;
  }

  private worker2MachineType(worker_type: WorkerType) {
    return (worker_type === WorkerType.http) ? MachineType.http : MachineType.browser
  }

  /**
   * Check that the following software is installed on the host:
   *
   * Install docker machine: https://github.com/docker/machine/releases
   *
   * 1. docker
   * 2. docker-compose
   * 3. docker-machine
   * 4. aws
   *
   * This is what we expect:
   *
     $ docker-machine --version
     docker-machine version 0.16.0, build 702c267f
   *
   */
  private async checkSoftwareInstalled(): Promise<boolean> {
    try {
      let docker_machine_version = await system('docker-machine --version');
      if (docker_machine_version.stdout.indexOf('docker-machine') === -1) {
        return false;
      }

      let aws_cli = await system('aws --version');
      return aws_cli.stdout.includes('aws-cli/');

    } catch (err) {
      this.logger.error(err.message);
      return false;
    }
  }

  /**
   * AWS access keys must be exported to the env.
   *
   * $ export AWS_ACCESS_KEY_ID=AKID1234567890
   * $ export AWS_SECRET_ACCESS_KEY=MY-SECRET-KEY
   *
   * Also some other env variables must be present.
   */
  private checkEnv() {
    let required_env_keys = ['AWS_ACCESS_KEY', 'AWS_SECRET_KEY',
      'MASTER_IP', 'DOCKER_USER', 'SWARM_JOIN_TOKEN_WORKER'];

    let abort = false;
    for (let key of required_env_keys) {
      if (!process.env[key]) {
        this.logger.error(`process.env key ${key} is missing.`);
        abort = true;
      }
    }
    if (abort) {
      this.logger.error(`Aborting due to missing env variables`);
      process.exit(1);
    } else {
      // set env files that docker-machine needs
      process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY;
      process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_KEY;
    }

    this.swarm_join_token = process.env.SWARM_JOIN_TOKEN_WORKER;
  }

  /**
   * Create some configuration files for aws-cli.
   */
  private async setupAwsProfile() {
    const homedir = os.homedir();

    const aws_profile_dir = path.join(homedir, '.aws/');

    if (!fs.existsSync(aws_profile_dir)){
      fs.mkdirSync(aws_profile_dir);
    }

    // write config files
    let cred_file = path.join(aws_profile_dir, 'credentials');
    let cred_contents = `
[default]
aws_access_key_id = ${process.env.AWS_ACCESS_KEY}
aws_secret_access_key = ${process.env.AWS_SECRET_KEY}
    `;
    fs.writeFileSync(cred_file, cred_contents);

    let config_file = path.join(aws_profile_dir, 'config');
    let config_contents = `
[default]
region = ${this.region}
output = json
    `;
    fs.writeFileSync(config_file, config_contents);
  }

  /**
   * https://docs.docker.com/machine/drivers/aws/
   *
   * This method allocates a docker cluster in the AWS cloud
   * with AWS elastic IP support.
   *
   * Unfortunately we need to manually configure
   *
   * 1. Add custom EC2 security group to allow port 3333 for app specific inbound traffic
   *  => can be done by specifying `--amazonec2-security-group`, sec group must be created manually on EC2 console
   * 2. Assign a elastic IP address
   * 3. Make the machine join the swarm
   *
   * How to provision an instance with elastic IP support?
   * => https://github.com/docker/machine/issues/3383
   *
   * commands on the remote docker machine can be executed with:
   *  `docker-machine ssh DockerCluster 'ifconfig'`
   *
   * Show active machines:
   * `docker-machine ls`
   *
   * Get ip address of machine:
   *  `docker-machine ip ClusterWorker0`
   *
   * and obtain all relevant metadata:
   *  `docker-machine inspect ClusterWorker0`
   *
   *  Known Issues:
   *
   *  1. Sometimes (1/5) machine provisioning fails due to: https://github.com/docker/machine/issues/3990
   */
  public async allocateMachine(machine_name: string, size: ClusterSize,
     eip: IEip, use_spot_instance: boolean = false, label: string = ''): Promise<IMachineDoc> {
    // https://aws.amazon.com/de/ec2/instance-types/
    let size_mapping = {
      'small' : 't2.small',
      'medium' : 't2.medium',
      'larger': 't2.large',
      'large': 't2.xlarge',
      'huge': 't2.2xlarge',
    };

    let instance_type = size_mapping[size] || 't2.small';

    // https://blog.scottlowe.org/2016/03/25/docker-swarm-aws-docker-machine/
    // https://docs.docker.com/machine/reference/create/
    // signal to the machine created that it should join the swarm
    // https://docs.docker.com/v17.09/machine/drivers/aws/

    let command = `docker-machine create \
--driver amazonec2 \
--amazonec2-open-port ${process.env.CRAWL_WORKER_PORT} \
--amazonec2-region ${this.region} \
--amazonec2-instance-type ${instance_type} \
--amazonec2-ami ${this.ami} \
--amazonec2-security-group ${this.security_group_name} \
--swarm \
--swarm-discovery token://${this.swarm_join_token} \
--swarm-addr ${process.env.MASTER_IP}`;

    if (use_spot_instance) {
      command += ` --amazonec2-request-spot-instance `;
      // use a price as threshold with `--amazonec2-spot-price`
    }

    if (label) {
      command += ` --engine-label ${label} `;
    }

    command += ` ${machine_name}`;

    this.logger.verbose(command);

    await this.system(command);

    return await this.handler.create({
      status: MachineStatus.initial,
      created: new Date(),
      terminated: null,
      info: await this.getMachineInfo(machine_name),
      name: machine_name,
      region: this.region,
      size: instance_type,
      eip: eip
    });
  }

  /**
   * Assign an elastic ip to the aws ec2 instance.
   */
  private async associateElasticIp(machine: IMachine) {
    let cmd = `aws ec2 associate-address --instance-id ${machine.info.Driver.InstanceId} --allocation-id ${machine.eip.eid}`;

    let response = await this.system(cmd);

    if (response) {
      return response.stdout.includes('AssociationId');
    }

    return this.dry_run;
  }

  /**
   * For some weird reason docker-machine is not
   * capable of making the node join our cluster.
   *
   * For that reason we ssh into the allocated machine and
   * make it join the swarm manually.
   *
   * docker-machine ssh ClusterWorker1 'sudo docker node update --label-add type=crawl_worker wlso64vllzvqkzz8a1u94wu9a'
   *
   * docker-machine ssh ClusterWorker2 'sudo docker swarm join --token SWMTKN-1-1f1fk6e0by0pmi0q8k3arbqhkt3nw38e78d3t6uas0mgj9j4nf-599pag8iov8u4oeuoqkcfsly9 167.99.241.135:2377'
   *
   * promote a node:
   *
   *  docker node promote ClusterWorker1
   *
   * add label to node:
   *
   * docker node update --label-add type=crawl_worker ClusterWorker2
   */
  private async makeMachineJoinSwarm(machine: IMachine) {
    try {
      let join_cmd = `sudo docker swarm join \
--token ${this.swarm_join_token} \
--advertise-addr ${machine.eip.ip} \
${process.env.MASTER_IP}:2377`;

      let complete_join_cmd = `docker-machine ssh ${machine.name} '${join_cmd}'`;
      await this.system(complete_join_cmd);
    } catch (err) {
      this.logger.error(err.toString());
    }
  }

  /**
   * Add a label to a machine.
   *
   * Example for a label: `--label-add type=crawl_worker`
   *
   * docker node update ip-172-31-17-55 --label-add test=test
   *
   * @param machine
   * @param label
   */
  private async addLabelToMachine(machine: IMachine, label: string) {
    try {
      let add_label_cmd = `sudo docker node update --label-add ${label} ${machine.name}`;
      let complete_label_cmd = `docker-machine ssh ${machine.name} '${add_label_cmd}'`;
      await this.system(complete_label_cmd);
    } catch (err) {
      this.logger.error(err.toString());
    }
  }

  public async cleanupAll(worker_type: WorkerType | null = null) {
    let filter = {};

    if (worker_type) {
      filter = {
        type: this.worker2MachineType(worker_type)
      };
    }

    this.machines = await this.handler.getMachines(filter);

    if (this.machines.length > 0) {
      this.logger.info(`Attempting to cleanup ${this.machines.length} machines`);
      for (let machine of this.machines) {
        await this.cleanup(machine);
      }
    }
  }

  /**
   * Cleanup aws ec2 state.
   */
  public async cleanup(machine: IMachineDoc) {
    if (machine) {
      let stopped: boolean = false;

      try {
        // first try to gracefully stop
        this.logger.info(`Gracefully stopping machine ${machine.name}`);
        await this.system(`docker-machine stop ${machine.name}`);
        stopped = true;
      } catch (err) {
        this.logger.warn(`Cannot stop machine gracefully ${machine.name}: ${err.toString()}`);
      }

      if (!stopped) {
        try {
          // then try to forcefully stop the machine
          this.logger.warn(`Forcefully stopping machine ${machine.name}`);
          await this.system(`docker-machine kill ${machine.name}`);
          stopped = true;
        } catch (err) {
          this.logger.warn(`Cannot kill machine forcefully ${machine.name}: ${err.toString()}`);
        }
      }

      if (!stopped) {
        try {
          // then try to terminate machine over aws cli
          this.logger.warn(`Terminate machine ${machine.name} via aws cli`);
          await this.system(`aws ec2 terminate-instances --instance-ids ${machine.info['Driver']['InstanceId']}`);
          stopped = true;
        } catch (err) {
          this.logger.warn(`Cannot terminate machine ${machine.name} via aws cli: ${err.toString()}`);
        }
      }

      if (stopped) {
        try {
          await this.system(`docker-machine rm ${machine.name} --force`);
          machine.status = MachineStatus.terminated;
          machine.terminated = new Date();
          await machine.save();
          // also deallocate elastic ip used
          await this.config_handler.freeElasticIp(machine.eip);
          this.logger.info(`Successfully stopped and terminated machine ${machine.name}`);
        } catch (err) {
          this.logger.error(`Cannot remove machine ${machine.name}: ${err.toString()}`);
        }
      } else {
        this.logger.warn(`Cannot stop/kill machine ${machine.name}`);
      }
    }
  }

  /**
   * Get all machine metadata via
   * `docker-machine inspect {machine-name}`
   *
   * @param machine_name
   */
  private async getMachineInfo(machine_name: string) {
    let info = {
      Driver: {
        IPAddress: '127.0.0.1'
      }
    };

    let cmd = `docker-machine inspect ${machine_name}`;
    this.logger.info(cmd);

    if (!this.dry_run) {
      let response = await system(cmd);
      info = JSON.parse(response.stdout.toString());
    }

    return info;
  }
}
