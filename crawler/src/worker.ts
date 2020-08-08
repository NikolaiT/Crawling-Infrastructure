import {WorkerContext} from "./index";
import {HttpWorkerConfig, BrowserWorkerConfig} from './config';
import {ExecutionEnv} from '@lib/types/common';
import {S3Controller} from "@lib/storage/storage";
import {Logger, getLogger} from '@lib/misc/logger';
import {gaussian} from '@lib/misc/stats';
import {randomElement, sleep} from '@lib/misc/helpers';
import {EnqueueHandler} from "./enqueue";
import {ProxyHandler} from "./proxy";
import {IProxyFilter, ProxyStatus} from "@lib/types/proxy";
import {TerminationNotification} from "./termination";
import {Context} from "aws-lambda";
import {ProxyOptions, ProxyChangeReason, allowed_filter_keys} from "@lib/types/proxy";
import {IAWSConfig} from "@lib/storage/storage";
import {hostname, platform, totalmem, uptime} from 'os';
import {system} from '@lib/misc/shell';

export interface IAWSOptions {
  access_key?: string;
  secret_key?: string;
  key: string;
  bucket: string;
  region: string;
}

export enum RemoveTag {
  script = 'script',
  noscript = 'noscript',
  style = 'style',
}

export enum WorkerStatus {
  healthy = 'healthy', // all fine
  no_proxy = 'no_proxy', // abort: unable to get working proxy
  no_time = 'no_time', // abort: no more time in worker
  page_error = 'page_error', // abort crawling because an page error occurred
}

export interface CleanHtmlOptions {
  // which tags to strip
  tags: Array<string>;
  // whether to clean html with a regex
  use_regex: boolean;
}

export interface IWorker {
  // the complete configuration
  config: any;
  // the status of the worker
  status: WorkerStatus;

  /**
   * Obtain versioning information for the worker
   */
  version(): Promise<any>;

  /**
   * Initializes the worker.
   */
  setup(): any;

  /**
   * All actions that should happen before the crawl() function is executed.
   */
  before_crawl(context: Context | WorkerContext): any;

  /**
    Implement your crawling logic here.

    You can return any value that you want which is stored in the cloud.

    From within the crawl() function you have access to the following functionality:

     (1) To solve google recaptcha v2, config.recaptcha_provider must have valid provider credentials such as

     ```
      {
        id: '2captcha',
        token: 'ENTER_YOUR_2CAPTCHA_API_KEY_HERE'
      }
     ```

     then you can use `await this.page.solveRecaptchas()` to solve captchas.

     (2) To request a new proxy, you can call `await this.page.get_proxy({})`

     (3) To enqueue items into a queue, you can call `await this.enqueue({})`

     (4) To download an url from the cloud, you can invoke `await this.getKey({})`

   */
  crawl(item: string): any;

  /**
   * Choose what proxy to use for this request.
   *
   * The chosen proxy will be used for all items that are
   * crawled with crawl().
   *
   * We need to ensure that we only use proxies
   * that were not blocked earlier and that we choose them
   * uniform randomly distributed.
   *
   * @param options ProxyOptions
   */
  get_proxy(options: ProxyOptions): any;

  /**
   * Get an item from s3 storage.
   *
   * The properties
   *
   * options.key
   * options.bucket
   * options.region
   *
   * need to be specified.
   *
   * If options.access_key and options.secret_key
   * are not specified, the internal credentials are chosen.
   *
   * @return Returns an absolute path to the locally stored value.
   */
  getKey(options: IAWSOptions): Promise<string>;

  /**
   * Persist any value to s3 storage.
   *
   * The arguments are the same as in getKey(), but an additional
   * argument value is required.
   *
   * @return In the case of success, returns the number of uploaded bytes.
   */
  setKey(value: string | Buffer, options: IAWSOptions): Promise<number>;

  /**
   * enqueue items into another tasks queue
   *
   * @param task_id the id of the task where to enqueue items. If the param `task_id` is '' or null,
   * the items will be enqueued in the own task queue of the current task.
   * @param items An array of strings that are the items to be enqueued
   * @param.options An options object that specifies how the items are to be enqueued
   *
   */
  enqueue(task_id: string | null, items: Array<string>, options: any): any;

  /**
   * Sleep randomly according to options.
   *
   * @param options
   */
  random_sleep(options: any): Promise<void>;

  /**
   * Sleep for the specified amount.
   * @param ms
   */
  sleep(ms: number): Promise<void>;

  /**
   * Clean the html from bloating tags.
   * @param options
   * @param html
   */
  clean_html(options: CleanHtmlOptions, html: string): Promise<string>;


  /**
   * Cleanup resources that the worker used.
   */
  cleanup(): Promise<void>;
}

export class BaseWorker implements IWorker {
  proxy_handler?: ProxyHandler;
  config: HttpWorkerConfig | BrowserWorkerConfig;
  // a number that increases with each crawled item
  crawl_num: number;
  // the current proxy being used
  proxy: any;
  logger: Logger;
  public num_proxies_obtained: number;
  public status: WorkerStatus;
  public options: any;
  public name: string;
  restart_worker: boolean;
  proxyChain: any;
  newProxyUrl?: string;

  constructor(config: HttpWorkerConfig | BrowserWorkerConfig, proxy_handler?: ProxyHandler) {
    this.num_proxies_obtained = 0;
    this.config = config;
    this.proxy_handler = proxy_handler;
    this.crawl_num = 0;
    this.proxy = null;
    this.status = WorkerStatus.healthy;
    this.logger = getLogger(null, 'worker', config.loglevel);
    this.options = this.config.options || {};
    this.restart_worker = false;
    this.name = 'Worker';
    this.proxyChain = require('proxy-chain');
  }

  public async version(): Promise<any> {
    let pjson: any = require('../package.json');
    let version_info: any = {};
    const interesting_properties: any = ['name', 'version', 'description', 'dependencies'];
    for (let key of interesting_properties) {
      if (pjson[key]) {
        version_info[key] = pjson[key];
      }
    }

    version_info.platform = {
      free: (await system('free -h')).stdout,
      totalmem: totalmem(),
      platform: platform(),
      uptime: uptime(),
      env: process.env,
    };

    return version_info;
  }

  public async setup(): Promise<any> {
    // we are using the apify package https://github.com/apifytech/proxy-chain
    // to make use of proxies that use username/password authentication
    // since we cannot use whitelisted proxies, because we cannot predict our public IP
    if (Array.isArray(this.config.proxies) && this.config.proxies.length > 0) {
      let random_proxy = randomElement(this.config.proxies);
      this.newProxyUrl = await this.proxyChain.anonymizeProxy(random_proxy);
      this.logger.info(`Use random proxy via proxy-chain: ${this.newProxyUrl} --> ${random_proxy}`);
    } else if (this.config.proxy_options && this.crawl_num === 0) {
      this.proxy = await BaseWorker.prototype.get_proxy.call(this, this.config.proxy_options);
      if (!this.proxy) {
        this.logger.warn(`Unable to obtain fresh proxy: ${this.proxy}, status: ${this.status}`);
      }
      this.logger.info(`Obtained initial proxy in setup()`);
    }
  }

  public async cleanup(): Promise<any> {

  }

  /**
   * Add all your logic here that needs to run before an item is crawled.
   *
   * 1. check if the worker is running out of time
   * 2. check if we need to reload a proxy
   *
   * @param context
   */
  public async before_crawl(context: Context | WorkerContext): Promise<any> {
    // on default, don't restart worker
    this.restart_worker = false;

    // are we running out of time?
    // if we decide to turn down, no need to restart, return immediately
    let turn_down: boolean = await TerminationNotification.turnDown(this.config.local_test, this.config.execution_env, context);
    if (turn_down) {
      this.logger.info(`Environment ${this.config.execution_env} ran out ouf time, turning down...`);
      this.status = WorkerStatus.no_time;
      return;
    }

    if (this.config.restart_before_crawl) {
      this.restart_worker = true;
    }

    if (this.config.proxy_options && this.crawl_num > 0) {
      this.logger.info(`Setup worker with proxy_options ${JSON.stringify(this.config.proxy_options)}`);
      let fresh_proxy = await BaseWorker.prototype.get_proxy.call(this, this.config.proxy_options);
      if (fresh_proxy) {
        this.proxy = fresh_proxy;
        this.restart_worker = true;
      } else {
        this.logger.warn(`Unable to obtain fresh proxy: ${fresh_proxy}, status: ${this.status}`);
      }
    }

    // when configured, sleep random normally distributed
    if (this.config.random_normal_sleep) {
      let {mean, stddev} = this.config.random_normal_sleep;
      // we assume that mean and scale is in seconds, not ms
      let time_to_sleep: number = Math.abs(gaussian(mean, stddev));

      // I currently see no reason why we would sleep longer than one hour
      if (time_to_sleep > 0 && time_to_sleep < 3600) {
        time_to_sleep *= 1000; // convert to ms
        this.logger.verbose(`Sleeping normally distributed (mean=${mean},scale=${stddev}) for ${time_to_sleep}ms`);
        await sleep(time_to_sleep);
      }
    }
  }

  public async crawl(item: string): Promise<any> {

  }

  public async enqueue(task_id: string | null, items: Array<string>, options: any = {}) {
    let handler = new EnqueueHandler(this.config, options);
    return await handler.enqueueItems(task_id, items);
  }

  /**
   * Get a new proxy from the master server.
   *
   * Make sure to rotate proxies internally and to use
   * them uniformly distributed.
   *
   * When we use a rotating proxy and get blocked, it doesn't
   * make sense to switch the proxy because it is rotating.
   *
   * Proxy and chrome is a clusterfuck, read this:
   * https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212
   * https://github.com/apifytech/proxy-chain
   *
   * @param options: set of criteria to filter proxy from db
   * @return: return a fresh proxy or null if no proxy could be obtained or the proxy should not
   *        be changed. If a fresh proxy is returned, the worker must be setup with that proxy.
   */
  public async get_proxy(options: ProxyOptions): Promise<any> {
    if (!this.proxy_handler) {
      this.logger.warn(`invalid proxy handler, aborting.`);
      this.status = WorkerStatus.no_proxy;
      return null;
    }

    // by default, get a fresh proxy for every call to get_proxy
    let change_every_nth_item = options.change || 1;
    if (typeof change_every_nth_item !== 'number') {
      change_every_nth_item = 1;
    }

    // if its not the first item to crawl and
    // it is the nth crawl number, do not change the
    // proxy
    if (this.crawl_num % change_every_nth_item !== 0) {
      return null;
    }

    // if the caller indicated that his proxy was blocked or damaged
    // update the state of the current proxy.
    if (this.proxy) {
      if (options.reason === ProxyChangeReason.blocked || options.reason === ProxyChangeReason.damaged || options.reason === ProxyChangeReason.check_failed) {
        await this.proxy_handler.updateProxy(this.proxy, options.reason);
      }
    }

    // if we are using a rotating proxy, just return the same proxy again
    if (this.proxy && this.proxy.rotating) {
      this.logger.verbose(`Not requesting new proxy because it is rotating`);
      return null;
    }

    // get a new proxy from the mongodb
    // only ever request functional proxies
    let filter: any = {
      status: ProxyStatus.functional
    };

    // copy filter options passed by user
    for (let key in options.filter) {
      if (allowed_filter_keys.includes(key)) {
        // @ts-ignore
        filter[key] = options.filter[key];
      }
    }

    // exclude whitelisted proxies when not using docker instances for crawling
    if (this.config.execution_env !== ExecutionEnv.docker) {
      if (options.filter && options.filter['whitelisted']) {
        options['filter']['whitelisted'] = false;
      }
    }

    let fresh_proxy = await this.proxy_handler.getFreshProxy(filter);

    if (fresh_proxy) {
      this.num_proxies_obtained++;
      this.logger.verbose(`Got a fresh proxy: ${JSON.stringify(fresh_proxy)}`);
      return fresh_proxy;
    } else {
      this.logger.warn(`Unable to obtain a working proxy. Aborting crawling.`);
      this.status = WorkerStatus.no_proxy;
    }

    return null;
  }

  private checkOptions(options: IAWSOptions): IAWSConfig {
    if (!options.key || !options.bucket || !options.region) {
      throw Error('properties `key`, `bucket` and `region` are required properties');
    }

    let s3_config: IAWSConfig = this.config.aws_config;

    // overwrite keys and secret only when provided, otherwise use
    // our own credentials
    if (options.access_key && options.secret_key) {
      s3_config.AWS_ACCESS_KEY = options.access_key;
      s3_config.AWS_SECRET_KEY = options.secret_key;
    }

    s3_config.AWS_BUCKET = options.bucket;
    s3_config.AWS_REGION = options.region;

    return s3_config;
  }

  /**
   * Get an item from AWS s3 storage, store it locally and return the
   * local path to the stored file.
   *
   * @param options: getKey aws s3 options
   */
  async getKey(options: IAWSOptions): Promise<string> {
    let s3_config: IAWSConfig = this.checkOptions(options);
    let storage = new S3Controller(s3_config);
    return await storage.storeFile(options.key);
  }

  /**
   * Upload something with key and value to s3 storage
   */
  async setKey(value: string | Buffer, options: IAWSOptions): Promise<number> {
    let s3_config: IAWSConfig = this.checkOptions(options);
    let storage = new S3Controller(s3_config);
    return await storage.upload(options.key, value);
  }

  /**
   * Sleep for the specified amount.
   * @param ms
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * @todo: delay randomly before type and click and goto
   * @todo: add random normal distributed delay
   *
   * slowmo
   * @param options
   */
  async random_sleep(options: any) {
    let min = options['min'];
    let max = options['max'];
    if (min && max) {
      //Generate Random number
      let rand = Math.floor(Math.random() * (max - min + 1) + min);
      await this.sleep(rand * 1000);
    }
  }

  async clean_html(options: CleanHtmlOptions, html: string = ''): Promise<string> {
    return '';
  }
}
