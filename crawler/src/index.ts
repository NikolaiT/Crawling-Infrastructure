import 'module-alias/register';
import {Context, Handler} from 'aws-lambda';
import {S3Controller} from '@lib/storage/storage';
import {CrawlQueue, MongoDB} from "./crawl_queue";
import zlib from 'zlib';
import {CrawlHandler} from './handler';
import {getLogger, Logger, LogLevel} from '@lib/misc/logger';
import {ResultPolicy, StoragePolicy} from '@lib/types/common';
import {getIpAddress, MetadataHandler} from './metadata';
import {ProxyHandler} from './proxy';
import {Item, QueueItemStatus} from "@lib/types/queue";
import {BrowserWorkerConfig, CrawlConfig, HttpWorkerConfig} from "./config";

/*
 * A context valid for a VPS machine and worker.
 *
 * Those workers have unlimited execution time and are deployed in
 * docker swarms on large EC2 instances or droplets.
 */
export interface WorkerContext {
  // Properties
  callbackWaitsForEmptyEventLoop: boolean;
  functionName: string;
  functionVersion: string;
  memoryLimitInMB: number;

  // Functions
  getRemainingTimeInMillis(): number;
}

export interface Response {
  status: number;
  message: string;
  result: any;
  metadata: any;
}

export class WorkerHandler {
  context: Context | WorkerContext;
  config: HttpWorkerConfig | BrowserWorkerConfig;
  response: Response;
  logger: Logger;
  meta: MetadataHandler;
  items: Array<Item>;
  mongodb: MongoDB;
  proxy_handler?: ProxyHandler;

  constructor(config: HttpWorkerConfig | BrowserWorkerConfig, context: Context | WorkerContext) {
    let config_handler = new CrawlConfig(config);
    this.items = [];
    this.context = context;
    this.config = config_handler.getDefaultConfig();
    this.response = {
      status: 200,
      message: 'ok',
      result: {},
      metadata: {}
    };
    this.config.loglevel = this.config.loglevel || LogLevel.info;
    this.logger = getLogger(null, 'index', config.loglevel);
    this.meta = new MetadataHandler(this.config);
    this.mongodb = new MongoDB(this.config);
  }

  public async start() {
    let is_local_crawl: boolean = Array.isArray(this.config.items) && this.config.items.length > 0;
    this.logger.debug(JSON.stringify(this.config, null, 2));
    this.logger.info(`Starting worker with task_id=${this.config.task_id} and worker_id=${this.config.worker_id}`);

    // we only need a public IP to test that proxies are working
    // therefore we only obtain it when `proxy_options` is passed
    if (this.config.proxy_options) {
      this.config.public_ip = this.config.public_ip || await getIpAddress();
      if (!this.config.public_ip) {
        return this.meta.finalize(this.response, 'Unable to obtain public ip. Aborting.', 400);
      }
      this.logger.info(`Worker has public ip = ${this.config.public_ip}`);
    }

    // we only need a mongodb connection to the master when we are using proxies
    // or when we store results in the cloud
    // or when we obtain items from the queue
    if (this.config.proxy_options || this.config.result_policy === ResultPolicy.store_in_cloud) {
      await this.mongodb.connectToMongoServer();
      if (this.mongodb.connected) {
        this.proxy_handler = new ProxyHandler(this.config);
      }
    }

    let result;

    if (is_local_crawl) {
      result = await this.localCrawl();
    } else {
      if (!this.mongodb.connected) {
        return this.meta.finalize(this.response, 'Unable to connect to mongodb', 400);
      }
      result = await this.remoteCrawl();
    }

    this.mongodb.disconnect();
    return result;
  }

  /**
   * A local crawl does not use a remote queue and does not
   * communicate back progress back to the master server.
   *
   * Useful for testing the functionality of crawl_worker.
   */
  public async localCrawl() {
    let region = '';
    if (this.config.aws_config && this.config.aws_config.AWS_REGION) {
      region = this.config.aws_config.AWS_REGION;
    }

    for (let i: number = 0; i < this.config.items.length; i++) {
      this.items.push({
        _id: i.toString(),
        item: this.config.items[i],
        status: QueueItemStatus.initial,
        crawled: null,
        retries: 0,
        error: '',
        region: region,
      });
    }
    this.config.num_items_worker = this.items.length;
    await this.runAndStore();
    return this.meta.finalize(this.response);
  }

  /**
   * Crawl with the master server interaction
   * - getting items from the remote master
   * - communicating back progress (worker meta, queue update)
   */
  public async remoteCrawl() {
    if (typeof this.config.num_items_worker !== 'number' || this.config.num_items_worker <= 0) {
      return this.meta.finalize(this.response, `num_items_worker must be a positive number in remote crawl`, 400);
    }

    // make a connection with master server mongodb
    let queue = new CrawlQueue(this.config);

    this.items = await queue.getItemsToCrawlSafe(this.config.num_items_worker);
    this.logger.debug(this.items);

    if (this.items.length <= 0) {
      await queue.updateWorkerMetaNew(this.meta);
      let msg = 'No items in queue. No work to do.';
      this.logger.warn(msg);
      return this.meta.finalize(this.response, msg, 200);
    }

    await this.runAndStore();

    this.meta.items = this.items;

    await queue.updateQueueNew(this.items);
    await queue.updateWorkerMetaNew(this.meta);

    return this.meta.finalize(this.response);
  }

  private async runAndStore() {
    let crawler: CrawlHandler = new CrawlHandler(this.config, this.context, this.response);

    await crawler.run(this.items, this.meta, this.proxy_handler);

    this.logger.debug(JSON.stringify(this.response.result, null, 2));

    if (this.config.result_policy === ResultPolicy.store_in_cloud) {
      this.response.result = await this.storeInCloud(this.items);
    } else if (this.config.result_policy === ResultPolicy.return) {
      // return an array of result objects
      let results: Array<any> = [];
      for (let item of this.items) {
        results.push({
          item: item.item,
          result: this.response.result[item._id],
        });
      }
      this.response.result = results;
      if (this.config.compress) {
        let json_str = JSON.stringify(this.response.result);
        this.response.result = zlib.deflateSync(json_str).toString('base64');
      }
    }
  }

  /**
   * Either we store all the results in one file as JSON (default)
   *
   * Alternatively we store each result as single blob under the item._id
   *   This is better when want to store Buffers of data.
   *
   * if results could not be successfully saved,
   * mark the `crawled` and `status` attribute of all
   * items as `null` and `initial` again such that
   * they will be retried by future worker instances
   *
   * @param items
   */
  async storeInCloud(items: Array<Item>) {
    let locations = [];
    let controller = new S3Controller(this.config.aws_config);

    if (this.config.storage_policy === StoragePolicy.merged) {
      try {
        let wid = this.config.worker_id || '0';
        let key = this.config.task_id + '/' + wid;
        let value = JSON.stringify(this.response.result);
        this.meta.bytes_uploaded += await controller.upload(key, value, this.config.compress);
        locations.push({
          config: this.config.aws_config,
          key: key,
        });
      } catch (err) {
        this.response.status = 500;
        this.response.message = err.toString();
        this.logger.error(err.toString());
        // when storing the items fails, items become initial again
        for (let item of items) {
          item.crawled = null;
          item.status = QueueItemStatus.initial;
        }
      }
    } else if (this.config.storage_policy === StoragePolicy.itemwise) {
      //@todo: make this faster, concurrent upload in chunks of 20 or so
      for (let item of items) {
        try {
          let key = this.config.task_id + '/' + item._id;
          let value = this.response.result[item._id];

          // we allow to store only Buffers or Strings. If that is not the case,
          // convert the return value to a string with JSON.stringify()
          if (!(typeof value === 'string' || value instanceof Buffer)) {
            value = JSON.stringify(value);
          }

          if (value) {
            this.meta.bytes_uploaded += await controller.upload(key, value, this.config.compress);
            locations.push({
              config: this.config.aws_config,
              key: key,
            });
          }
        } catch (err) {
          this.logger.error(err.toString());
          // reset item state
          item.crawled = null;
          item.status = QueueItemStatus.initial;
          this.response.status = 500;
          this.response.message = err.toString();
        }
      }
    }

    return locations;
  }
}

export const handler: Handler = async (config: HttpWorkerConfig | BrowserWorkerConfig, context: Context | WorkerContext) => {
  let worker_handler = new WorkerHandler(config, context);
  return await worker_handler.start();
};
