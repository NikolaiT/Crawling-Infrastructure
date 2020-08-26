import {LogLevel} from "@lib/misc/logger";
import {ProxyOptions} from "@lib/types/proxy";
import {IAWSConfig} from "@lib/storage/storage";
import {downloadMaybeGzipped} from "@lib/misc/http";
import {ResultPolicy, ExecutionEnv, StoragePolicy, VersionInfo} from '@lib/types/common';

export interface ICookie {
  name: string;
  value: string;
  domain: string;
}

// in seconds
export interface IRandomNormalSleep {
  mean: number; // middle of the normal distribution
  stddev: number; // deviation of the normal distribution
}

export interface IViewport {
  width: number;
  height: number;
}

export interface IRecaptchaProvider {
  id: string,
  token: string;
}

/**
 * Data taken from here: https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide
 */
export const supported_screen_sizes = [{width: 1920, height: 1080}, {width: 1366, height: 768}, {width: 1440, height: 900},
  {width: 1536, height: 864}, {width: 1600, height: 900}, {width: 1280, height: 800}, {width: 1280, height: 720}, {width: 1280, height: 1024}, {width: 1024, height: 768}, {width: 1680, height: 1050}, {width: 2560, height: 1440}, {width: 1920, height: 1200}, {width: 1360, height: 768}, {width: 1600, height: 1024}, {width: 1400, height: 1050}, {width: 1280, height: 1024}, {width: 1440, height: 900}, {width: 1400, height: 900}, {width: 1280, height: 960}];

export interface HttpWorkerConfig {
  // returns versioning information and quits the process.
  version: VersionInfo;
  // when the items are passed directly to the worker, there is no
  // need to obtain the items from the remote master
  // no need to update items, worker_meta
  items: Array<string>;
  // sets the logging output level
  loglevel: LogLevel;
  worker_id?: number;
  // the task id belonging to this task
  task_id?: string;
  // connection string for the mongodb on remote server
  mongodb_url: string;
  // number of items that this worker processes
  num_items_worker: number;
  // the policy what to do with results
  result_policy: ResultPolicy;
  // whether to compress data when uploading to the cloud
  compress: boolean;
  // the function to be executed as code
  function_code: string;
  // an url to the function to be executed as code
  function_url: string;
  // all requests are done with this user agent
  user_agent: string;
  // http headers that are set on Got and pptr
  headers: any;
  // when set to true, a random user agent is chosen
  // with {deviceCategory: 'mobile'} on setup
  random_user_agent: boolean;
  // whether to randomize the accept-language header on setup
  // browser fingerprinting is includes this header sometimes,
  // therefore it's smart to spoof it when changing proxies
  random_accept_language: boolean;
  // the default accept language header
  // headless chrome does not send an
  // accept language header by default, which enables
  // bot detection companies to detect chrome headless
  // (See: FP-Crawlers: Studying the Resilience of Browser
  // Fingerprinting to Block Crawlers)
  default_accept_language: string;
  // sleep random normally distributed between crawl() requests
  random_normal_sleep: IRandomNormalSleep;
  // the default http request timeout for Got
  request_timeout: number;
  // when proxy options are passed, each worker invokes
  // get_proxy() implicitly before a call to crawl().
  proxy_options?: ProxyOptions;
  // when an non-empty array of proxies are passed,
  // each crawler takes one proxy randomly and makes all request through it
  // we are using https://github.com/apifytech/proxy-chain
  // to allow username/password authentication
  // if proxy_options AND proxies both are passed in the configuration,
  // proxy_options is ignored and set to null
  proxies?: Array<string>,
  // an array of cookies. Each cookie must have the
  // properties cookie.name, cookie.value and cookie.domain
  cookies: Array<ICookie>;
  // where the worker is running
  execution_env: ExecutionEnv;
  // aws config used to store data to s3
  aws_config: IAWSConfig;
  // how to store results on s3
  storage_policy: StoragePolicy;
  // save screenshot when browser exception is triggered
  store_browser_debug: boolean;
  // whether the worker should log it's publicly accessible IP address
  log_ip_address: boolean;
  // whether it's a local test
  local_test: boolean;
  // the public ip address
  // of the crawler. Use in order
  // to determine if the proxy works
  public_ip: string;
  // options passed to each worker
  options: any;
  // options passed to user-agents package
  // user_agent_options overrides `random_user_agent`
  user_agent_options: any;
  // when set to true, invoke setup() in after any crawl() method
  restart_before_crawl: boolean;
  // send worker metadata on result
  worker_metadata: boolean;
}

export interface BrowserWorkerConfig extends HttpWorkerConfig {
  // whether to start browser in headless, only works in execution env `local`
  headless: boolean;
  // the viewport size of the headless browser
  viewport: IViewport;
  // default navigation timeout. Default is 30s.
  default_navigation_timeout: number;
  // path to chromium binary to be used with puppeteer
  chromium_binary: string;
  // pass additional params to puppeteer
  pup_args: Array<string>;
  // whether to intercept certain media types when using puppeteer
  intercept_types: Array<string>;
  // whether the module https://www.npmjs.com/package/puppeteer-extra-plugin-stealth should be used
  // to hide the headless chromium browser
  apply_evasion: boolean;
  // test whether bot evasion is good boy
  test_evasion: boolean;
  // Path to a User Data Directory: https://chromium.googlesource.com/chromium/src/+/master/docs/user_data_dir.md
  user_data_dir: string;
  // uses a random user data dir
  // whenever a new browser is started
  random_user_data_dir: boolean;
  // whether to dump io to stdout/stderr
  dumpio: boolean;
  // block WebRTC traffic in order to prevent IP leaks
  block_webrtc: boolean;
  // block WebRTC traffic via an chromium extension.
  // @todo: check if this leaks memory.
  block_webrtc_extension: boolean;
  // test webrtc leak
  test_webrtc_leak: boolean;
  // whether to pick a random common desktop viewport
  random_viewport: boolean;
  // recaptcha solving provider credentials
  recaptcha_provider: IRecaptchaProvider;
  // use this timezone when starting a new chrome browser
  // set via process.env['TZ']
  // example 'Europe/Paris'
  timezone: string;
  // use this language when starting a new chrome browser
  // set via process.env['LANGUAGE']
  // example 'fr_FR'
  language: string;
}

export class CrawlConfig {
  public config: BrowserWorkerConfig;

  constructor(config: HttpWorkerConfig | BrowserWorkerConfig) {
    this.config = config as any;
  }

  /**
   * Populates default configuration for the worker
   * and returns it.
   *
   * Sets all default values required by the worker.
   */
  public getDefaultConfig(): HttpWorkerConfig | BrowserWorkerConfig {
    this.config.loglevel = this.config.loglevel || LogLevel.info;

    // set a default screen size of full hd
    this.config.viewport = this.config.viewport || {width: 1920, height: 1080};

    this.config.default_navigation_timeout = this.config.default_navigation_timeout || 40000;

    this.config.request_timeout = this.config.request_timeout || 15000;

    // if we upload to the cloud and uncompress is not defined, compress should be set to true
    if (this.config.result_policy === ResultPolicy.store_in_cloud) {
      if (this.config.compress === undefined) {
        this.config.compress = true;
      }
    }

    // when not explicitly set to false, we try to
    // apply the stealth plugin from https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth
    if (this.config.apply_evasion === undefined) {
      this.config.apply_evasion = true;
    }

    if (this.config.default_accept_language === undefined) {
      this.config.default_accept_language = 'en-US,en;q=0.9';
    }

    // if not set, try to block webrtc IP leak
    if (this.config.block_webrtc === undefined) {
      this.config.block_webrtc = true;
    }

    if (this.config.options === undefined) {
      this.config.options = {};
    }

    if (this.config.local_test === undefined) {
      this.config.local_test = false;
    }

    if (this.config.store_browser_debug === undefined) {
      this.config.store_browser_debug = false;
    }

    if (this.config.worker_metadata === undefined) {
      this.config.worker_metadata = false;
    }

    if (this.config.aws_config === undefined) {
      this.config.aws_config = {
        AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
        AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
        AWS_REGION: process.env.AWS_REGION,
        AWS_BUCKET: process.env.AWS_BUCKET,
      } as IAWSConfig;
    }

    // set execution_env from environment variable EXECUTION_ENV
    if (Object.values(ExecutionEnv).includes(process.env.EXECUTION_ENV as ExecutionEnv)) {
      this.config.execution_env = process.env.EXECUTION_ENV as ExecutionEnv;
    } else if (!Object.values(ExecutionEnv).includes(this.config.execution_env)) {
      // when this.config.execution_env is unset, set it to ExecutionEnv.lambda
      this.config.execution_env = ExecutionEnv.lambda;
    }

    this.config.result_policy = this.config.result_policy || ResultPolicy.return;

    if (!Object.values(StoragePolicy).includes(this.config.storage_policy)) {
      this.config.storage_policy = StoragePolicy.itemwise;
    }

    if (Array.isArray(this.config.proxies) && this.config.proxies.length > 0) {
      this.config.proxy_options = undefined;
    }

    if (this.config.function_url) {
      (async () => {
        try {
          this.config.function_code = await downloadMaybeGzipped(this.config.function_url);
        } catch (err) {
          console.error(`Cannot download function code from url ${this.config.function_url}: ${err}`);
        }
      });
    }

    return this.config;
  }
}
