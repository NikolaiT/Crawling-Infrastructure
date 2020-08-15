import {getLogger, Logger} from "@lib/misc/logger";
import {HttpWorkerConfig, BrowserWorkerConfig} from './config';
import {Response} from "./index";
import {getRandomUserAgent, getRandomIPApi} from './helpers';
import {WorkerStatus} from "./worker";
import {Item} from "@lib/types/queue";
const got = require('got');

/**
 * Obtain the public ip or all metadata
 */
export async function getIpAddress(api_url: string = '', ret_all: boolean = false) {
  let url: string = api_url || getRandomIPApi();

  let options = {
    headers: {
      "User-Agent": getRandomUserAgent()
    },
    timeout: 10000,
    retry: 0,
  };

  try {
    let response = await got(url, options);
    let parsed = JSON.parse(response.body);
    if (parsed.ip && parsed.ip.length > 0) {
      if (ret_all) {
        return parsed;
      } else {
        return parsed.ip;
      }
    }
  } catch (err) {
    console.error(`Error requesting IP address with provider ${api_url}: ${err.toString()}`);
  }

  return '';
}

export class MetadataHandler {
  public avg_items_per_second: number;
  public num_items_crawled: number;
  public num_items_failed: number;
  public num_proxies_obtained: number;
  public worker_status: WorkerStatus;
  public items: Array<Item>;
  private elapsed_crawling_ms: number;
  private crawling_started: Date;
  private crawling_ended: Date;
  private elapsed_ms: number;
  private started: Date;
  private ended: Date;
  public bytes_uploaded: number;
  config: BrowserWorkerConfig | HttpWorkerConfig;
  logger: Logger;

  constructor(config: BrowserWorkerConfig | HttpWorkerConfig) {
    this.logger = getLogger(null, 'metadata', config.loglevel);
    this.config = config;
    this.avg_items_per_second = 0;
    this.num_items_crawled = 0;
    this.num_proxies_obtained = 0;
    this.elapsed_crawling_ms = 0;
    this.elapsed_ms = 0;
    this.started = new Date();
    this.ended = new Date();
    this.crawling_ended = new Date();
    this.crawling_started = new Date();
    this.bytes_uploaded = 0;
    this.num_items_failed = 0;
    this.worker_status = WorkerStatus.healthy;
    this.items = [];
  }

  public async startCrawling() {
    this.crawling_started = new Date();
  }

  /**
   * Computes the average number of successfully crawled items per second.
   *
   * We only want to count successfully crawled items, since erroneously crawled
   * items skews the avg number of items per second.
   */
  public computeAverageItemsPerSecond(): void {
    this.crawling_ended = new Date();
    this.elapsed_crawling_ms = this.crawling_ended.valueOf() - this.crawling_started.valueOf();

    if (this.elapsed_crawling_ms <= 0) {
      this.avg_items_per_second = 0;
    } else {
      this.avg_items_per_second = this.num_items_crawled / (this.elapsed_crawling_ms / 1000);
    }

    this.logger.info(`Elapsed crawling: ${this.elapsed_crawling_ms}, Average items/second: ${this.avg_items_per_second}`);
  }

  public finalize(response: Response, message: string = 'ok', status: number = 200): any {
    response.status = status;
    response.message = message;
    this.ended = new Date();
    this.elapsed_ms = this.ended.valueOf() - this.started.valueOf();
    this.logger.info(`Elapsed time: ${this.elapsed_ms}ms, elapsed crawling time: ${this.elapsed_crawling_ms}ms`);
    const member_names = Object.keys(this) as Array<keyof MetadataHandler>;
    let exclude = ['config', 'logger', 'items'];

    if (this.config.local_test) {
      exclude = ['config', 'logger'];
    }

    for (let name of member_names) {
      if (!exclude.includes(name)) {
        response.metadata[name] = this[name];
      }
    }
    response.metadata.worker_id = this.config.worker_id;
    response.metadata.task_id = this.config.task_id;
    if (this.config.public_ip) {
      response.metadata.public_ip = this.config.public_ip;
    }

    if (!response.worker_metadata) {
      delete response.worker_metadata;
    }

    return response;
  }
}
