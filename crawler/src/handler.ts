import {Context} from 'aws-lambda';
import {Response, WorkerContext} from '.';
import {HttpWorkerConfig, BrowserWorkerConfig} from './config';
import {QueueItemStatus} from "@lib/types/queue";
import {S3Controller} from '@lib/storage/storage';
import {BrowserWorker} from './browser_worker';
import {RequestError, HTTPError} from 'got';
import {Logger, getLogger} from '@lib/misc/logger';
import {MetadataHandler} from './metadata';
import {ProxyHandler} from "./proxy";
import {WorkerStatus} from './worker';
import {PageError} from './browser_worker';

export const puppeteer_proxy_error_needles = [
  'net::ERR_PROXY_CONNECTION_FAILED', // treat as proxy connection error
  'net::ERR_TUNNEL_CONNECTION_FAILED', // also treat as proxy connection error
  'net::ERR_SSL_PROTOCOL_ERROR',
  'net::ERR_CERT_AUTHORITY_INVALID',
];

// Those are the status codes that by default indicate
// that the requested resources blocked us for proxy
// reasons. That is probably not always accurate.
// https://httpstatuses.com/
export const http_codes_proxy_failure = [
  401, // Unauthorized
  403, // Forbidden
  407, // Proxy Authentication Required
  429, // Too Many Requests
  451, // Unavailable For Legal Reasons
];

export class CrawlHandler {
  config: HttpWorkerConfig | BrowserWorkerConfig;
  context: Context | WorkerContext;
  response: Response;
  logger: Logger;

  constructor(config: HttpWorkerConfig | BrowserWorkerConfig, context: Context | WorkerContext, response: Response) {
    this.config = config;
    this.context = context;
    this.response = response;
    this.logger = getLogger(null, 'handler', config.loglevel);
  }

  public async run(items: Array<any>, meta: MetadataHandler, proxy_handler?: ProxyHandler) {
    let worker = null;

    try {
      const result: any = {};

      let storage = new S3Controller(this.config.aws_config);

      let { BrowserWorker }: any = require('./browser_worker');
      let { HttpWorker} : any = require('./http_worker');

      let WorkerClass = eval('(' + this.config.function_code + ')');

      worker = new WorkerClass(this.config, proxy_handler);

      let setup_success = await worker.setup();
      if (!setup_success) {
        this.logger.error(`Could not setup ${worker.name}. Aborting.`);
        return false;
      }

      await meta.startCrawling();

      for (let i = 0; i < items.length; i++) {
        let item = items[i];
        worker.crawl_num = i;

        await worker.before_crawl(this.context);

        // check if we need to abort crawling
        if (worker.status !== WorkerStatus.healthy) {
          this.logger.warn(`Abort crawling for reason: ${worker.status}`);
          meta.worker_status = worker.status;

          // if we abort crawling, the remaining items stay in status `running`.
          // we don't want that, we want to set them back to state `initial` so
          // a future, more successful crawl task can make progress on them.
          for (let k = i; k < items.length; k++) {
            items[k].crawled = null;
            items[k].status = QueueItemStatus.initial;
          }
          // abort crawling
          break;
        }

        try {
          result[item._id] = null;
          // increase the crawl counter of this item regardless of failure
          item.retries += 1;

          let t0 = new Date();

          result[item._id] = await worker.crawl(item.item);

          let t1 = new Date();
          let elapsed = t1.valueOf() - t0.valueOf();

          // if the crawl() function doesn't raise an exception, we assume
          // that the item was properly crawled/scraped
          item.crawled = new Date();
          item.status = QueueItemStatus.completed;
          item.error = '';
          // count an item as crawled only if the
          // crawl() function doesn't raise an exception
          meta.num_items_crawled++;

          this.logger.verbose(`[${i}] Successfully crawled item ${item.item} in ${elapsed}ms`);

        } catch (Error) {
          meta.num_items_failed++;
          this.logger.error(`[${i}] Failed to crawl item ${item.item} with error: ${Error.message}`);

          let err_message = Error.toString();
          let block_detected: boolean = false;

          for (let needle of puppeteer_proxy_error_needles) {
            if (err_message.includes(needle)) {
              this.logger.info(`Request blocked/detected in browser worker: ${needle}`);
              block_detected = true;
            }
          }

          // When a http request fails, it contains a code property with error class code, like ECONNREFUSED.
          if (Error instanceof RequestError) {
            if (worker.proxy) {
              this.logger.warn(`Current proxy ${worker.proxy.proxy} unable to create proxy connection`);
            } else {
              // do not change proxy here, this is a issue of the client
              this.logger.warn(`RequestError while crawl(): ${Error.code}`);
            }
          // If the server's response code is not 2xx.
          } else if (Error instanceof HTTPError) {
            let status_code = Error.response.statusCode;
            for (let code of http_codes_proxy_failure) {
              if (status_code === code) {
                this.logger.warn(`Request blocked/detected in http worker. statusCode=${status_code}`);
                block_detected = true;
              }
            }
          }

          item.status = QueueItemStatus.failed;
          item.error = Error.message;

          result[item._id] = {
            'error_message': Error.toString(),
            'error_trace': Error.stack,
            'proxy': worker.proxy,
          };

          // only request proxies if the worker is allowed to use them
          if (this.config.proxy_options && block_detected) {
            // dont consider it failed when we detected a common
            // proxy issue
            item.retries--;
            await worker.get_proxy({reason: 'blocked'});
          }

          if (this.config.store_browser_debug) {
            Object.assign(result[item._id], await worker.getDebugInfo());
          }

          // if it is an error that makes it impossible to
          // continue crawling (such as a memory leak), abort crawling
          if (Error instanceof PageError) {
            this.logger.error('Got an PageError. Abort crawling now.');
            worker.status = WorkerStatus.page_error;
          }
        }
      }

      meta.computeAverageItemsPerSecond();
      meta.num_proxies_obtained = worker.num_proxies_obtained;
      this.response.result = result;
    } catch (error) {
      this.logger.error(error.stack);
      this.response.status = 500;
      this.response.message = error.toString();
    } finally {
      if (worker) {
        await worker.cleanup();
      }
    }
  }
}
