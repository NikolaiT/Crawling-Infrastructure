import {HttpWorkerConfig, BrowserWorkerConfig} from './config';
import {RequestError, HTTPError} from 'got';
import {Logger, getLogger} from '@lib/misc/logger';
import {MetadataHandler} from './metadata';
import {WorkerStatus} from './worker';
import {CrawlConfig} from './config';
import {PageError} from './browser_worker';
import {VersionInfo} from '@lib/types/common';
import { BrowserWorker } from './browser_worker';
import { HttpWorker} from './http_worker';
import { startProxyServer } from './proxy_server';
import {puppeteer_proxy_error_needles, http_codes_proxy_failure} from './handler';
import {ResultPolicy, ExecutionEnv} from '@lib/types/common';

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
    this.logger = getLogger(null, 'persistantHandler', config.loglevel);
    this.state = State.initial;
    this.http_worker = null;
    this.browser_worker = null;
    let config_handler = new CrawlConfig(config);
    this.config = config_handler.getDefaultConfig();
  }

  public async setup() {
    if (this.state === State.initial) {
      // start the proxy server in the background.
      let server = startProxyServer();

      this.config.worker_id = 1;
      // @ts-ignore
      this.config.result_policy = ResultPolicy.return;
      // @ts-ignore
      this.config.random_user_agent = false;
      // @ts-ignore
      this.config.apply_evasion = true;
      // @ts-ignore
      this.config.block_webrtc = true;
      // @ts-ignore
      this.config.pup_args = [`--proxy-server=http://localhost:8000`];

      this.http_worker = new HttpWorker(this.config);
      this.browser_worker = new BrowserWorker(this.config as BrowserWorkerConfig);
      await this.http_worker.setup();
      await this.browser_worker.setup();
      this.state = State.running;
    }
  }

  public async run(body: any) {
    await this.setup();
    const result: any = [];
    let items = body.items || [];

    if (this.http_worker === null || this.browser_worker === null) {
      return result;
    }

    if (body.proxy) {
      // signal to the intermediate proxy server what upstream proxy we want to use
      await this.browser_worker.page.setExtraHTTPHeaders({
        'x-no-forward-upstream-proxy': body.proxy
      });
    } else {
      await this.browser_worker.page.setExtraHTTPHeaders({
        'x-no-forward-upstream-proxy': ''
      });
    }

    try {
      let WorkerClass = eval('(' + this.config.function_code + ')');
      let worker = new WorkerClass();
      this.logger.info('Using crawler: ' + worker.constructor.name);
      // copy functionality from parent class
      // @TODO: find better way
      worker.page = this.browser_worker.page;
      worker.options = this.browser_worker.options;
      worker.logger = this.browser_worker.logger;
      worker.sleep = this.browser_worker.sleep;
      worker.random_sleep = this.browser_worker.random_sleep;
      worker.clean_html = this.browser_worker.clean_html;

      for (let i = 0; i < items.length; i++) {
        let item = items[i];
        // check if we need to abort crawling
        if (this.browser_worker.status !== WorkerStatus.healthy) {
          this.logger.warn(`Abort crawling for reason: ${this.browser_worker.status}`);
          break;
        }
        try {
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
