import {Request, Response} from "express";
import * as dotenv from "dotenv";
import {WorkerHandler} from '../index';
import {PersistantCrawlHandler} from '../persistant_handler';
import {ResultPolicy} from '@lib/types/common';
import {v1 as uuid_v1} from 'uuid';
import {hostname, platform, totalmem, uptime} from 'os';
import {isAuthenticated} from './middleware/auth';
import * as package_info from '../../package.json';
import {getLogger, Logger, LogLevel} from '@lib/misc/logger';
import {system} from '@lib/misc/shell';

dotenv.config();

export enum State {
  initial = 'initial',
  running = 'running',
  failed = 'failed'
}

export class WorkerService {
  state: State;
  exec_id: string;
  logger: Logger;
  persistantCrawlHandler: PersistantCrawlHandler | null;

  constructor() {
    this.state = State.initial;
    this.exec_id = uuid_v1();
    this.logger = getLogger(null, 'worker.service', LogLevel.info);
    this.persistantCrawlHandler = null;
  }

  public static checkApiCall(req: Request, res: Response) {
    let winning: boolean = true;

    if (req.body['API_KEY'] !== process.env.API_KEY && req.params['API_KEY'] !== process.env.API_KEY) {
      res.status(401).send({error: `invalid api key`});
      winning =  false;
    }

    return winning;
  }

  public async hello(req: Request, res: Response) {
    let info: any = {
      'status': 200,
      'message': `Welcome to CrawlWorker running on ${hostname()}`,
      'version': package_info.version,
      'author': package_info.author,
    };

    if (isAuthenticated(req)) {
      info.free = (await system('free -h')).stdout;
      info.totalmem = totalmem();
      info.platform = platform();
      info.uptime = uptime();
      info.env = process.env;
    }

    return res.json(info);
  }

  /**
   * Fire and forget.
   *
   * The worker needs to store crawled data in the cloud.
   *
   * This only makes sense when the result_policy is set to store_in_cloud
   *
   * @param req
   * @param res
   */
  public async invokeEvent(req: Request, res: Response) {
    if (!WorkerService.checkApiCall(req, res)) return;

    if (req.body.result_policy !== ResultPolicy.store_in_cloud) {
      return res.status(400).json({
        status: 400,
        error: `result_policy must be "store_in_cloud"`
      }).end();
    }

    if (this.state === State.initial) {
      this.state = State.running;

      let handler = new WorkerHandler(req.body, {} as any);
      let that = this;
      let terminate: boolean = true;
      if (req.body.exit_when_finished === false) {
        terminate = false;
      }

      handler.start().then((response: any) => {
        this.state = State.initial;
        that.logger.info(`crawler finished with status ${response.status}`);
        that.logger.debug(`crawler response: ${JSON.stringify(response)}`);

        // @todo: The crawl_worker leaks somehow memory which is indicated by warnings such as
        // @todo: (node:9) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 31 targetcreated listeners added. Use emitter.setMaxListeners() to increase limit
        // @todo: and (node:10) UnhandledPromiseRejectionWarning: PageError: Error: Page crashed!

        // @todo: Current solution: just terminate the current process with zerp exit code
        // @todo: such that docker swarm respawns the process. very ugly, but should work.
        if (terminate) {
          this.logger.info('terminate worker');
          process.exit(0);
        }
      }).catch((err: any) => {
        this.state = State.failed; // if the crawler fails, will not be responsive anymore
        that.logger.error(`crawler failed with error: ${err.toString()}`);
      });

      this.exec_id = uuid_v1();

      return res.status(200).json({
        status: 200,
        message: req.body.worker_type + ' successfully started',
        id: this.exec_id,
      }).end();

    } else {
      this.logger.verbose(`Ignoring crawl request, crawler is in state: ${this.state}`);
      return res.status(400).json({
        status: 400,
        error: `Cannot process request, worker is in state ${this.state}`,
      }).end();
    }
  }

  public async invokeRequestResponse(req: Request, res: Response) {
    if (!WorkerService.checkApiCall(req, res)) return;

    if (this.state === State.initial) {
      let handler = new WorkerHandler(req.body, {} as any);
      this.state = State.running;
      await handler.start().then((response: any) => {
        this.state = State.initial;
        this.exec_id = uuid_v1();
        response.id = this.exec_id;
        res.status(200).json(response);
      }).catch((err: any) => {
        this.state = State.failed;
        res.status(500).json({
          status: 500,
          error: err.toString()
        });
      });
    }
  }

  /**
   * Keep a worker running all the time. Do not call setup() and cleanup()
   * on the worker in between API requests. Idea: Reduce latency and response time as much as possible.
   * Prevent browser worker from starting again.
   */
  public async blankSlate(req: Request, res: Response) {
    if (!WorkerService.checkApiCall(req, res)) return;

    if (this.state === State.initial) {
      if (this.persistantCrawlHandler === null) {
        this.persistantCrawlHandler = new PersistantCrawlHandler(req.body);
      }
      this.state = State.running;
      await this.persistantCrawlHandler.run(req.body).then((response: any) => {
        this.state = State.initial;
        this.exec_id = uuid_v1();
        response.id = this.exec_id;
        res.status(200).json(response);
      }).catch((err: any) => {
        this.state = State.failed;
        res.status(500).json({
          status: 500,
          error: err.toString()
        });
      });
    }
  }
}
