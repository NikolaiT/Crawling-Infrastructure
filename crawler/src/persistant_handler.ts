import {HttpWorkerConfig, BrowserWorkerConfig} from './config';
import {RequestError, HTTPError} from 'got';
import {Logger, getLogger} from '@lib/misc/logger';
import {MetadataHandler} from './metadata';
import {WorkerStatus} from './worker';
import {PageError} from './browser_worker';
import {VersionInfo} from '@lib/types/common';
import { BrowserWorker } from './browser_worker';
import { HttpWorker} from './http_worker';
import { startProxyServer } from './proxy_server';
import {puppeteer_proxy_error_needles, http_codes_proxy_failure} from './handler';

export enum State {
  initial = 'initial',
  running = 'running',
  failed = 'failed'
}

export class PersistantCrawlHandler {
  config: HttpWorkerConfig | BrowserWorkerConfig;
  logger: Logger;
  state: State;
  http_worker: HttpWorker | null;
  browser_worker: BrowserWorker | null;

  constructor(config: HttpWorkerConfig | BrowserWorkerConfig) {
    this.config = config;
    this.logger = getLogger(null, 'persistantHandler', config.loglevel);
    this.state = State.initial;
    this.http_worker = null;
    this.browser_worker = null;
  }

  public async setup() {
    if (this.state === State.initial) {
      // start the proxy server in the background.
      let server = startProxyServer();
      this.http_worker = new HttpWorker(this.config);
      this.browser_worker = new BrowserWorker(this.config as BrowserWorkerConfig);
      await this.http_worker.setup();
      await this.browser_worker.setup();
      this.state = State.running;
    }
  }

  public async run(items: Array<any>) {
    await this.setup();
    const result: any = {};

    if (this.http_worker === null || this.browser_worker === null) {
      return result;
    }

    try {
      let WorkerClass = eval('(' + this.config.function_code + ')');

      let worker = new WorkerClass(this.browser_worker.page);

      for (let i = 0; i < items.length; i++) {
        let item = items[i];

        // check if we need to abort crawling
        if (this.browser_worker.status !== WorkerStatus.healthy) {
          this.logger.warn(`Abort crawling for reason: ${this.browser_worker.status}`);
          break;
        }

        try {
          result[item._id] = null;
          // increase the crawl counter of this item regardless of failure
          item.retries += 1;

          let t0 = new Date();

          result.push(await worker.crawl(item));

          let t1 = new Date();
          let elapsed = t1.valueOf() - t0.valueOf();

          this.logger.verbose(`[${i}] Successfully crawled item ${item} in ${elapsed}ms`);

        } catch (Error) {
          this.logger.error(`[${i}] Failed to crawl item ${item} with error: ${Error.message}`);

          let err_message = Error.toString();
          let block_detected: boolean = false;

          for (let needle of puppeteer_proxy_error_needles) {
            if (err_message.includes(needle)) {
              this.logger.info(`Request blocked/detected in browser worker: ${needle}`);
              block_detected = true;
            }
          }

          result.push({
            'error_message': Error.toString(),
            'error_trace': Error.stack,
          });
        }
      }

      return result;
    } catch (error) {
      this.logger.error(error.stack);
    } finally {
    }
  }
}
