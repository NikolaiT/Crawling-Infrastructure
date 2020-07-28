import {Request, Response} from "express";
import {MAX_IPS, MIN_IPS, STORAGE_DIR} from "../constants/crawlTaskApi.constants";
import {CrawlStatus, ICrawlTask, StoragePolicy, TaskHandler, WorkerType} from "../models/crawltask.model";
import {QueueHandler} from "../models/queue.model";
import {IAWSConfig, S3Controller} from '@lib/storage/storage';
import {WorkerMetaHandler} from "../models/workermeta.model";
import {ConfigHandler} from "../models/config";
import {ProxyHandler} from "../models/proxy.model";
import {MachineHandler} from '../models/machine.model';
import {exec} from 'child_process';
import {chunkRead, deleteFolderRecursive, formatBytes, walk} from "@lib/misc/helpers";
import zlib from 'zlib';
import {Config} from '../../scheduler/config';
import {system} from "@lib/misc/shell";
import {getLogger, Logger} from "@lib/misc/logger";
import {getTaskById} from './helpers';
import fs from 'fs';
import path from 'path';
import {assignRegions, checkItems, configureCrawlProfile, loadFunctionCode, profileAllowed} from "./lib";


export class CrawlTaskService {
  private config: Config | null;
  private task_handler: TaskHandler;
  logger: Logger;

  constructor() {
    this.config = null;
    this.logger = getLogger(null, 'api');
    this.task_handler = new TaskHandler();
  }

  public async setup() {
    try {
      let config_handler = new ConfigHandler();
      this.config = await config_handler.getConfig();
    } catch(err) {
      this.logger.error(`Cannot get config: ${err}`);
    }
  }

  private bucketByRegion(region: string) {
    for (let obj of this.config.regions) {
      if (obj.region === region) {
       return obj.bucket;
      }
    }
    return null;
  }

  public checkCrawlingSpeed(body: any): any {
    if (body.max_items_per_second && !isNaN(body.max_items_per_second)) {
      if (body.max_items_per_second > MAX_IPS || body.max_items_per_second < MIN_IPS) {
        return {
          error: `max_items_per_second must be in range [${MIN_IPS}...${MAX_IPS}]`
        };
      }
    } else {
      body.max_items_per_second = 1.0;
    }
  }

  public async getAllCrawlTasks(req: Request, res: Response) {
    let select = req.body.select || '';

    try {
      let tasks = await this.task_handler.task_model.find({}, select).lean();
      res.json(tasks);
    } catch (err) {
      res.status(400).json({error: err.toString()});
    }
  }

  /**
   * Updates all crawl tasks.
   *
   * @param req
   * @param res
   */
  public async updateTasks(req: Request, res: Response): Promise<any> {
    if (!req.body.query) {
      return res.status(400).send({error: 'Key `query` is missing.'});
    }

    if (!req.body.update) {
      return res.status(400).send({error: 'Key `update` is missing.'});
    }

    try {
      res.json(await this.task_handler.task_model.update(
        req.body.query,
        req.body.update,
        { multi: true, upsert: false })
      );
    } catch (err) {
      res.status(400).send({error: err.toString()});
    }
  }

  public async getAllMachines(req: Request, res: Response) {
    let machine_handler = new MachineHandler();
    let select: any = {};

    try {
      res.json(await machine_handler.getAll({}, select));
    } catch (err) {
      res.status(400).send({error: err.toString()});
    }
  }

  public async deleteAllMachines(req: Request, res: Response) {
    let machine_handler = new MachineHandler();
    try {
      await machine_handler.drop();
      res.json({ message: 'Dropped all machines' });
    } catch (err) {
      res.status(400).send({error: err.toString()});
    }
  }

  public async getAllWorkerMeta(req: Request, res: Response) {
    let task = await getTaskById(req, res, this.task_handler);
    if (!task) {
      return;
    }

    let filter = req.body.filter || {};
    let sort = req.body.sort || {};
    let limit = req.body.limit || null;
    let worker_meta_handler = new WorkerMetaHandler(task.worker_meta);

    worker_meta_handler.getAll(filter, sort, limit).then((all) => {
      res.json(all);
    }).catch((err) => {
      res.status(400).send({error: err.toString()});
    });
  }

  /**
   * Get the s3 location for all results.
   *
   * all s3 locations are given by the expression
   *
   * And the object url is
   *
   * https://{bucket}.s3.{region}.amazonaws.com/{location}
   *
   * @param req
   * @param res
   */
  public async getTaskStorage(req: Request, res: Response) {
    if (!req.params.id) {
      res.status(400).send({error: 'Key "id" is missing.'});
      return;
    }
    let how: string = '';

    if (req.query.how) {
      how = req.query.how.toString();
      if (!['cmd', 'flat', 'mergeScript'].includes(how)) {
        res.status(400).send({error: 'query param how must be either one of `cmd`, `flat` or `mergeScript`'});
        return;
      }
    }
    await this.taskResults(req.params.id, how).then((s3_locations) => {
      res.json(s3_locations);
    }).catch((err) => {
      res.status(400).send({error: err.toString()});
    });
  }

  /**
   * Set task status from running --> paused
   *
   * @param req
   * @param res
   */
  public async pauseTasks(req: Request, res: Response) {
    await this.task_handler.task_model.updateMany({
        status: CrawlStatus.started
      }, {
      status: CrawlStatus.paused
    }).then((onupdated) => {
      res.status(200).json({message: 'paused all crawl tasks'});
    }).catch((updatefailed) => {
      res.status(400).json({error: `Could not pause tasks: ${updatefailed}`});
    });
  }

  /**
   * Set task status from paused ---> running
   *
   * @param req
   * @param res
   */
  public async resumeTasks(req: Request, res: Response) {
    await this.task_handler.task_model.updateMany({
      status: CrawlStatus.paused
    }, {
      status: CrawlStatus.started
    }).then((onupdated) => {
      res.status(200).json({message: 'resumed all crawl tasks'});
    }).catch((updatefailed) => {
      res.status(400).json({error: `Could not resume tasks: ${updatefailed}`});
    });
  }

  public async downloadSample(req: Request, res: Response): Promise<any> {
    let task = await getTaskById(req, res, this.task_handler);
    if (!task) {
      return;
    }

    if (task.storage_policy !== StoragePolicy.itemwise) {
      return res.status(400).send({error: 'Can only get samples of tasks with `itemwise` storage policy.'});
    }

    let sample_size: number = 10;
    if (req.query.sample_size) {
      sample_size = Number(req.query.sample_size.toString());
    }
    sample_size = Math.min(task.num_items, sample_size);

    // download most recent items
    let download_location = await this.downloadMostRecentItems(task, true, sample_size);

    // inflate the files
    // now find all files recursively
    // decompress them and add them to a data structure
    let files = await walk(download_location);

    for (let path_to_file of files) {
      let contents = fs.readFileSync(path_to_file);
      let inflated = zlib.inflateSync(contents).toString();
      let new_file = path.join(path.dirname(path_to_file), path.basename(path_to_file).split('.')[0] + '_inflated');
      fs.writeFileSync(new_file, inflated);
    }

    // create tar.gz of the result files
    let base_dir = path.dirname(download_location);
    let task_dir = path.basename(download_location);

    let tarfile = `/tmp/${task._id}.tar`;
    let cmd = `cd ${base_dir} && tar -cvzf ${tarfile} ${task_dir}/*_inflated -C ${task_dir}`;
    exec(cmd, (error, stdout, stderr) => {
      // delete storage directory
      deleteFolderRecursive(download_location);
      if (error) {
        return res.status(400).send({error: `exec error: ${error}`});
      }
      return res.download(tarfile, `${task._id}.tar`);
    });
  }

  public async showTaskResults(req: Request, res: Response) {
    let task = await getTaskById(req, res, this.task_handler);
    if (!task) {
      return;
    }

    let download_location = null;
    let most_recent: boolean = (req.query.recent === 'recent' || req.query.recent === '1') || false;
    let sample_size: number = 0;
    if (req.query.sample_size) {
      sample_size = Number(req.query.sample_size.toString());
    }

    if (sample_size) {
      sample_size = Math.min(task.num_items, sample_size);
    }

    // download most recent items
    download_location = await this.downloadMostRecentItems(task, most_recent, sample_size);

    if (!sample_size && task.num_items > 50000) {
      res.status(200).send({message: 'Currently not downloading huge tasks from cloud.'});
      return;
    }

    if (!download_location) {
      download_location = await CrawlTaskService.downloadResults(task, sample_size);
    }

    // now find all files recursively
    // decompress them and add them to a data structure
    let files = await walk(download_location);

    let obj = {};

    for (let path_to_file of files) {
      if (task.storage_policy === StoragePolicy.merged) {
        let contents = fs.readFileSync(path_to_file);
        let inflated = zlib.inflateSync(contents).toString();
        let json_data = JSON.parse(inflated);
        Object.assign(obj, json_data);
      } else if (task.storage_policy === StoragePolicy.itemwise) {
        try {
          let item_id = path.basename(path_to_file);
          let contents = fs.readFileSync(path_to_file);
          let inflated = zlib.inflateSync(contents).toString();
          obj[item_id] = JSON.parse(inflated);
        } catch (err) {
          console.error(err.toString());
        }
      }
    }

    res.json(obj);
    return;
  }

  /*
    mongoexport --uri="mongodb://mongodb0.example.com:27017/reporting"  --collection=events  --out=events.json [additional options]
  */
  public async getMapping(req: Request, res: Response) {
    let task = await getTaskById(req, res, this.task_handler);
    if (!task) {
      return null;
    }

    try {
      let mapping = {};
      let queue_handler = new QueueHandler(task.queue);
      let queue_id_to_item_mapping = await queue_handler.getQueueItems({}, 'id item');
      for (let obj of queue_id_to_item_mapping) {
        mapping[obj['_id']] = obj['item'];
      }
      return res.json(mapping);
    } catch (err) {
      return res.status(400).send({error: `cannot get item mapping: ${err}`});
    }
  }

  /**
   * What we want is an array of
   *
   * {
   *  item: item_string
   *  s3_location: url
   * }
   *
   * for each single item.
   *
   * @param task_id
   * @param flat: Only show root directory of results
   * @param how:
   */
  public async taskResults(task_id: string, how: string) {
    let task = await this.task_handler.task_model.findById(task_id);
    let results = [];

    if (task) {
      if (how === 'cmd') {
        let s3_urls: string = '';
        for (let region of task.regions) {
          s3_urls += `s3://${region.bucket}/${task_id} `;
        }

        let download_command = '#!/usr/bin/env bash\n\n';
        download_command += `mkdir -p /tmp/storage/\n`;
        download_command += `aws configure set aws_access_key_id ${process.env.AWS_ACCESS_KEY}\naws configure set aws_secret_access_key ${process.env.AWS_SECRET_KEY}\n
s3_urls=(${s3_urls})

for url in "\${s3_urls[@]}"
do
    # download s3 bucket
    aws s3 sync "$url" /tmp/storage/ --only-show-errors
done`;
        return download_command;
      }

      // create node script that downloads s3 results
      // and then merges the files
      if (how === 'mergeScript') {
        let inline_mapping: boolean = !this.taskTooLargeForDownload(task);
        this.logger.info(`Renaming items via queue access: ${inline_mapping}`);
        let s3_urls: string = '';
        let mapping = {};
        for (let region of task.regions) {
          s3_urls += `"s3://${region.bucket}/${task_id}", `;
        }

        let mapping_code;

        if (inline_mapping) {
          let queue_handler = new QueueHandler(task.queue);
          let queue_id_to_item_mapping = await queue_handler.getQueueItems({}, 'id item');
          for (let obj of queue_id_to_item_mapping) {
            mapping[obj['_id']] = obj['item'];
          }
          mapping_code = `let mapping = ${JSON.stringify(mapping)};`;
        } else {
          // translate items via Api Call
          // inline mapping would be too large
          let download_mapping_cmd = `mongoexport --authenticationDatabase admin --host ${process.env.MASTER_IP} --db CrawlMasterQueue --forceTableScan --jsonArray --fields="id,item" \
              --username ${process.env.MONGO_INITDB_ROOT_USERNAME} --password ${process.env.MONGO_INITDB_ROOT_PASSWORD} --collection ${task.queue}  --out=json_results/mapping.json`
          mapping_code = `execSync('${download_mapping_cmd}');
let raw_mapping = JSON.parse(fs.readFileSync('json_results/mapping.json'));
let mapping = {};
for (let obj of raw_mapping) {
  mapping[obj['_id']['$oid']] = obj['item'];
}`;
        }

        let script: string = `#!/usr/bin/env node

const execSync = require('child_process').execSync;
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { EOL } = require('os');

let version_check = execSync('aws --version');
if (!version_check.includes('aws-cli')) {
    console.error('please install aws-cli');
    process.exit(1);
}

execSync('mkdir -p /tmp/storage/');
execSync('mkdir -p json_results/');

// how many items per results file
let chunk_size = 10000;

${mapping_code}

execSync(\`aws configure set aws_access_key_id ${process.env.AWS_ACCESS_KEY}\`);
execSync(\`aws configure set aws_secret_access_key ${process.env.AWS_SECRET_KEY}\`);

let s3_urls = [${s3_urls}];

for (let s3_url of s3_urls) {
  execSync(\`aws s3 sync \${s3_url} /tmp/storage/ --only-show-errors\`);
}

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const fileStat = fs.lstatSync(filePath);
    if (fileStat.isDirectory()) {
      walk(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function write_file(chunk, obj) {
  let file_name = 'json_results/results_' + chunk + '.json';
  fs.writeFileSync(file_name, JSON.stringify(obj, null, 2));
  console.log('wrote chunk ' + chunk + ' to file ' + file_name);
}

(async () => {
    // all results should be downloaded. Merge and create JSON result file.
    let files = await walk('/tmp/storage/');
    console.log(\`downloaded \${files.length} files\`);
    let obj = {};
    let i = 0;
    let chunk = 0;
    let n = 0;
    let z = 0;
    let failed = new Set();
    for (let path_to_file of files) {
        try {
          let contents = fs.readFileSync(path_to_file);
          let inflated = zlib.inflateSync(contents).toString();
          let json_data = JSON.parse(inflated);
          for (let key in json_data) {
            z++;
            if ('error_message' in json_data[key] || 'error_trace' in json_data[key]) {
              failed.add(mapping[key]);
            } else {
              obj[mapping[key]] = json_data[key];
              mapping[key] = '__ok__';
              i++;
              n++;
            }
          }
        } catch (err) {
          console.error(err.toString());
        }
        // see if we need to rotate the file
        if (i >= chunk_size) {
          chunk++;
          write_file(chunk, obj);
          obj = {};
          i = 0;
        }
    }
    chunk++;
    write_file(chunk, obj);
    console.log('stored ' + z + ' items in total! ' + failed.size + ' items failed in total!');
    let truly_failed = [];
    for (key in mapping) {
      if (mapping[key] !== '__ok__') {
        truly_failed.push(mapping[key]);
      }
    }
    console.log(truly_failed.length + '/' + n + ' items truly failed!');
    fs.writeFileSync('json_results/failed.txt', truly_failed.join(EOL));
})();`;
        return script;
      }

      for (let region of task.regions) {
        if (how === 'flat') {
          results.push({
            s3_url: `s3://${region.bucket}.s3.${region.region}.amazonaws.com/${task_id}/`,
          });
        } else {
          let aws_config: IAWSConfig = {
            AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
            AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
            AWS_REGION: region.region,
            AWS_BUCKET: region.bucket,
          };
          let controller = new S3Controller(aws_config);
          let keys = await controller.allKeys(task._id.toString());

          for (let key of keys) {
            results.push({
              s3_url: `s3://${region.bucket}.s3.${region.region}.amazonaws.com/${key}`,
              item: key.split('/').slice(-1)[0]
            })
          }
        }
      }
    }
    return results;
  }

  /**
   * Download task results to {storage_dir}/{task.id}/
   *
   * @param task
   * @param max_files
   */
  static async downloadResults(task: ICrawlTask, max_files: number = null) {
    let storage_dir = path.join(STORAGE_DIR, task.id);
    let storage_key = `/${task._id}`;

    for (let region of task.regions) {
      let aws_config: IAWSConfig = {
        AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
        AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
        AWS_REGION: region.region,
        AWS_BUCKET: region.bucket,
      };

      try {
        let controller = new S3Controller(aws_config);
        await controller.storeDirAwsCli(storage_key, storage_dir);
      } catch (err) {
        console.error(`Could not download from region: ${err.toString()}`);
      }
    }

    return storage_dir;
  }

  async downloadMostRecentItems(task: ICrawlTask, most_recent: boolean, sample_size: number) {
    let download_location = null;
    // download sample_size most recent items
    if (most_recent && sample_size) {
      let queue_handler = new QueueHandler(task.queue);
      let items = await queue_handler.getRecentCompleted(sample_size);

      if (items) {
        let storage_dir = path.join(STORAGE_DIR, task.id);
        if (!fs.existsSync(storage_dir)) {
          fs.mkdirSync(storage_dir, {recursive: true});
        }
        download_location = storage_dir;

        for (let item of items) {
          let item_region = item.region.trim();
          if (item_region) {
            if (task.storage_policy === StoragePolicy.itemwise) {
              let key = task._id + '/' + item._id;
              let aws_config: IAWSConfig = {
                AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
                AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
                AWS_REGION: item.region,
                AWS_BUCKET: this.bucketByRegion(item_region),
              };
              let controller = new S3Controller(aws_config);
              try {
                await controller.storeFile(key, storage_dir);
              } catch (err) {
                console.error(err.toString());
              }
            }
          }
        }
      }
    }
    return download_location;
  }

  /**
   * Make a rough estimate whether a user should donwload the task herself.
   *
   * @param task
   */
  public taskTooLargeForDownload(task: ICrawlTask): boolean {
    if (task.storage_policy === StoragePolicy.itemwise) {
      return task.num_items > 10000;
    } else if (task.storage_policy === StoragePolicy.merged) {
      return task.num_items > 20000;
    }
    return false;
  }

  /**
   * Download all results from the s3 storage.
   *
   * Task results might be spread across different regions.
   *
   * @param req
   * @param res
   */
  public async downloadTask(req: Request, res: Response) {
    let task: any = await getTaskById(req, res, this.task_handler);
    if (!task) {
      return;
    }

    if (this.taskTooLargeForDownload(task)) {
      res.status(200).send({message: 'Currently not downloading huge tasks from cloud.'});
      return;
    }

    let download_location = await CrawlTaskService.downloadResults(task);

    this.logger.info(`Task results downloaded to ${download_location}`);

    let base_dir = path.dirname(download_location);
    let task_dir = path.basename(download_location);

    let tarfile = `/tmp/${task._id}.tar`;
    let cmd = `cd ${base_dir} && tar -cvf ${tarfile} ${task_dir} -C ${task_dir}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return res.status(400).send({error: `exec error: ${error}`});
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);

      return res.download(tarfile, `${task._id}.tar`);
    });
  }

  /**
   * Creates a crawl task.
   *
   * @param obj
   * @param store_task If set to true, will create a database object of the crawl task. Also doesn't create a queue.
   * @param no_queue dont create a queue in backend
   * @private
   */
  public async _createCrawlTask(obj: any, store_task: boolean = true, no_queue: boolean = false): Promise<any> {
    if (!(obj.function || obj.function_code)) {
      return {error: `either function or function_code is required`};
    }

    if (obj.items) {
      let items_err = await checkItems(this.logger, obj.items);
      if (items_err) {
        return items_err;
      }
    }

    let ips_err = this.checkCrawlingSpeed(obj);
    if (ips_err) {
      return ips_err;
    }

    let priority = obj.priority || 1;

    if (priority < 1 || priority > 10) {
      return {error: 'key `priority` must be between 1 and 10.'};
    }

    if (obj.profile) {
      let err = await profileAllowed(this.logger, obj.profile);
      if (err) {
        return err;
      }
    }

    // populate crawl task object
    let crawl_task: any = {
      worker_id: 0,
      priority: priority,
      status: obj.status || CrawlStatus.started,
      function: obj.function,
      max_items_per_second: obj.max_items_per_second || 1.0,
      max_items_per_worker: obj.max_items_per_worker || null,
      whitelisted_proxies: obj.whitelisted_proxies || false,
      storage_policy: obj.storage_policy || StoragePolicy.itemwise,
      crawl_options: obj.crawl_options || {
        default_navigation_timeout: 45000,
        request_timeout: 10000,
      },
      options: obj.options || {},
      num_items_crawled: 0,
      regions: [],
    };

    if (Array.isArray(obj.items)) {
      crawl_task.num_items = obj.items.length;
    }

    let function_code = obj.function_code || '';

    if (!function_code && obj.function) {
      try {
        function_code = await loadFunctionCode(this.logger, obj.function);
        let max_function_code_size: number = this.config.max_function_code_size || 25000;
        if (typeof function_code === 'string' && function_code.length > max_function_code_size) {
          return {error: `Function code is too large with size of ${function_code.length} bytes`};
        }
      } catch (e) {
        this.logger.error(e.toString());
      }
    }

    if (!function_code) {
      return { error: 'Error loading function code' };
    }

    crawl_task.function_code = function_code;

    if (crawl_task.function_code.includes('extends HttpWorker')) {
      crawl_task.worker_type = WorkerType.http;
    } else {
      crawl_task.worker_type = WorkerType.browser;
    }

    if (crawl_task.whitelisted_proxies) {
      // increase default timeout when using whitelisted proxies
      if (!crawl_task.crawl_options) {
        crawl_task.crawl_options = {
          default_navigation_timeout: 60000,
          request_timeout: 20000,
          apply_evasion: true,
          random_user_agent: false,
        }
      }
    }

    // assign the crawl profile
    configureCrawlProfile(this.logger, obj.profile, crawl_task);

    // assign regions
    assignRegions(this.config, obj, crawl_task);

    if (!store_task) {
      return crawl_task;
    } else {
      // finally create the task
      let new_task;
      try {
        new_task = await this.task_handler.task_model.create(crawl_task);
      } catch (err) {
        return {error: `Task creation failed: ${err}`};
      }

      new_task.worker_meta = 'worker_meta_' + new_task.id;

      if (new_task.worker_type === WorkerType.http) {
        new_task.avg_items_per_second_worker.push(0.5);
      } else {
        new_task.avg_items_per_second_worker.push(0.2);
      }

      if (!no_queue && obj.items) {
        new_task.queue = 'item_queue_' + new_task.id;
        let allow_duplicates = obj.allow_duplicates || true;
        // create queue_handler from items
        // by default, allow duplicate items
        new_task.num_items = await CrawlTaskService.createItemsQueue(obj.items, new_task.queue, allow_duplicates);
      }

      if (!no_queue && Array.isArray(obj.items)) {
        new_task.num_items = obj.items.length;
      }

      try {
        await new_task.save();
        this.logger.info(new_task);
        return new_task;
      } catch (err) {
        return {error: `Error saving task: ${err}`};
      }
    }
  }

  public async createCrawlTask(req: Request, res: Response): Promise<any> {
    let val;

    try {
      val = await this._createCrawlTask(req.body);
    } catch (err) {
      this.logger.error(`Failed to create crawl task with payload: ${JSON.stringify(req.body)}`);
      return res.status(400).send({error: 'Could not create crawl task: ' + err});
    }

    if (val && val.error) {
      return res.status(400).send(val);
    } else {
      return res.json(val);
    }
  }

  public async getTask(req: Request, res: Response) {
    let task: any = await getTaskById(req, res, this.task_handler);
    if (!task) {
      return res.status(400).send({error: 'Could not get task'});
    } else {
      return res.json(task);
    }
  }

  /**
   * Delete crawl task and all worker meta and all queue items.
   *
   * @param req
   * @param res
   */
  public async deleteCrawlTask(req: Request, res: Response) {
    let task: any = await getTaskById(req, res, this.task_handler);
    if (!task) {
      return task;
    }

    if (task.queue) {
      let queue_handler = new QueueHandler(task.queue);
      try {
        await queue_handler.dropQueue();
        this.logger.info('Dropped queue.');
      } catch (err) {
        return res.status(400).send({error: err.toString()});
      }
    }

    if (task.worker_meta) {
      let meta_handler = new WorkerMetaHandler(task.worker_meta);
      try {
        await meta_handler.dropWorkerMeta();
        this.logger.info('Dropped worker meta.');
      } catch (err) {
        this.logger.warn(`Cannot delete worker meta collection: ${err.toString()}`);
      }
    }

    try {
      await this.task_handler.task_model.findByIdAndDelete(task._id);
      this.logger.info('Deleted task.');
      return res.json({'message': 'Deleted successfully'});
    } catch(err) {
      return res.status(400).send({error: err.toString()});
    }
  }

  public async createConfig(req: Request, res: Response) {
    try {
      let config_handler = new ConfigHandler();
      let result = await config_handler.createConfig();
      return res.json(result);
    } catch(err) {
      return res.status(400).send({error: err.toString()});
    }
  }

  public async getConfig(req: Request, res: Response) {
    try {
      let config_handler = new ConfigHandler();
      let config = await config_handler.getConfig();
      return res.json(config);
    } catch(err) {
      return res.status(400).send({error: err.toString()});
    }
  }

  public async updateConfig(req: Request, res: Response) {
    try {
      let config_handler = new ConfigHandler();
      let result = await config_handler.update(req.body);
      return res.json(result);
    } catch(err) {
      return res.status(400).send({error: err.toString()});
    }
  }

  public async deleteAll(req: Request, res: Response) {
    if (req.body.collection === 'proxies') {
      let proxy_handler = new ProxyHandler();
      await proxy_handler.deleteAll().then(async (result) => {
        await proxy_handler.loadProxies();
        res.json({'message': 'Recreated proxy fixtures.'});
      }).catch((err) => {
        res.status(400).send({error: err.toString()});
      });
    }

    await this.task_handler.task_model.collection.drop().then((dropped) => {
      res.json({'message': 'Dropped all crawl tasks.'});
    }).catch((err) => {
      res.status(400).send({error: err.toString()});
    });
  }

  /**
   * Once a task is created, not all properties should be able to be updated.
   *
   * @param req
   * @param res
   */
  public async updateCrawlTask(req: Request, res: Response) {
    const task_id = req.params.id;

    const allowed_update_keys = ['status', 'max_lost_workers', 'retry_failed_items',
      'max_items_per_worker', 'priority', 'priority_policy', 'function', 'longliving', 'max_workers',
      'max_items_per_second', 'crawl_options', 'whitelisted_proxies', 'num_lost_workers', 'log_ip_address', 'num_workers_running', 'function_code', 'name'];

    let update: any = {};

    for (let key in req.body) {
      // if key is allowed, add it to the update obj
      if (allowed_update_keys.includes(key)) {
        update[key] = req.body[key];
      }
    }

    if (update.max_items_per_second) {
      if (typeof update.max_items_per_second !== 'number') {
        return res.status(400).send({error: 'max_items_per_second must be positive number'});
      }
    }

    if (update.retry_failed_items) {
      if (typeof update.retry_failed_items !== 'number' || update.retry_failed_items < 0 || update.retry_failed_items > 10 ) {
        return res.status(400).send({error: 'retry_failed_items must be number in range [0,10]'});
      }
    }

    if (update.max_lost_workers) {
      if (typeof update.max_lost_workers !== 'number' || update.max_lost_workers < 0 && update.max_lost_workers > 1000 ) {
        return res.status(400).send({error: 'max_lost_workers must be number in range [0,1000]'});
      }
    }

    if (update.max_workers) {
      if (typeof update.max_workers !== 'number' || update.max_workers < 0 && update.max_workers > 500 ) {
        return res.status(400).send({error: 'max_workers must be number in range [0,500]'});
      }
    }

    if (update.max_items_per_worker) {
      if (typeof update.max_items_per_worker !== 'number' || update.max_items_per_worker < 0 && update.max_items_per_worker > 500 ) {
        return res.status(400).send({error: 'max_items_per_worker must be number in range [0,500]'});
      }
    }

    if (update.num_workers_running) {
      if (typeof update.num_workers_running !== 'number' || update.num_workers_running < 0) {
        return res.status(400).send({error: 'num_workers_running must be number larger 0'});
      }
    }

    if (update.priority) {
      if (typeof update.priority !== 'number' || update.priority < 0 && update.priority > 10 ) {
        return res.status(400).send({error: 'priority must be number in range [0,10]'});
      }
    }

    if (update.num_lost_workers) {
      if (typeof update.num_lost_workers !== 'number' || update.num_lost_workers < 0 || update.num_lost_workers > 1000) {
        return res.status(400).send({error: 'num_lost_workers must be number in range [0,1000]'});
      }
    }

    if (update.name) {
      if (typeof update.name !== 'string' || update.name.length > 200) {
        return res.status(400).send({error: 'name must be a string of max length of 200'});
      }
    }

    if (update.function && update.function.length > 0) {
      try {
        let function_code = await loadFunctionCode(this.logger, update.function);
        if (!function_code) {
          return res.status(400).send({ error: 'Error loading function code' });
        }
        update.function_code = function_code;

        if (function_code.includes('extends HttpWorker')) {
          update.worker_type = WorkerType.http;
        } else {
          update.worker_type = WorkerType.browser;
        }

      } catch (err) {
        return res.status(400).send({ error: err.toString() });
      }
    }

    // @todo: check that function code is valid javascript
    if (update.function_code && update.function_code.length > 0) {
      if (!update.function_code.includes('extends HttpWorker') &&
        !update.function_code.includes('extends BrowserWorker')) {
        return res.status(400).send({ error: '`function_code` must extend either HttpWorker or BrowserWorker' });
      }
    }

    return this.task_handler.task_model.findByIdAndUpdate(task_id, update, {new: true},
      (error: Error, task: any) => {
        if (error) {
          return res.status(400).send({error: error.toString()});
        }
        return res.json(task);
      }
    );
  }


  /**
   * If items_source is a remote file, download it with curl and store it in /tmp
   *
   * If it is a local file, do nothing.
   *
   * @param items_source
   * @returns {Promise<void>}
   */
  static async maybeDownloadItemsFile(items_source: string): Promise<any> {
    let items_file = null;

    if (fs.existsSync(items_source)) {
      console.log('Items_source is a local file.');
      items_file = items_source;
    } else {
      console.log('Items_source is a url: ' + items_source);
      items_file = path.join('/tmp/', path.basename(items_source));
      await system(`curl -o ${items_file} ${items_source}`);
    }

    if (items_file.endsWith('.gz') || items_file.endsWith('.gzip')) {
      await system(`gunzip -f ${items_file}`);
      // remove .gz or .gzip suffix
      items_file = items_file.split('.').slice(0, -1).join('.');
    }

    if (!fs.existsSync(items_file)) {
      console.error('Could not obtain items file.');
      return null;
    } else {
      let stats = fs.statSync(items_file);
      let num_bytes = stats['size'] || 0;
      console.log(`Obtained ${formatBytes(num_bytes)} of items data.`);
    }

    return items_file;
  }

  /**
   * items could be an array, local file or url to a remote item file (may be gzipped)
   *
   * @param items
   * @param queue
   * @param allow_duplicates
   */
  static async createItemsQueue(items: any, queue: string, allow_duplicates=true): Promise<number> {
    let handler = new QueueHandler(queue);

    if (Array.isArray(items)) {
      return await handler.insertItems(items);
    } else {
      let items_file = await CrawlTaskService.maybeDownloadItemsFile(items);
      if (items_file) {
        return await chunkRead(items_file, handler.insertItems.bind(handler));
      }
    }
    return 0;
  }
}
