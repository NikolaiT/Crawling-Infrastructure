import {WorkerContext} from ".";
import {HttpWorkerConfig} from './config';
import {BaseWorker} from "./worker";
import {ProxyOptions} from "@lib/types/proxy";
import * as tough from 'tough-cookie';
import {CleanHtmlOptions} from './worker';
const Got = require('got');
import {Logger, getLogger} from '@lib/misc/logger';
import {ProxyHandler} from "./proxy";
import {getProxyAgent, getRandomAcceptLanguageHeader} from './helpers';
import {Context} from "aws-lambda";

export class HttpWorker extends BaseWorker {
  Cheerio: any;
  Got: any;
  UserAgent: any;
  config: HttpWorkerConfig;
  logger: Logger;

  constructor(config: HttpWorkerConfig, proxy_handler?: ProxyHandler) {
    super(config, proxy_handler);
    this.config = config;
    this.Cheerio = require('cheerio');
    this.Got = require('got');
    this.UserAgent = require('user-agents');
    this.logger = getLogger(null, 'http_worker', config.loglevel);
    this.name = 'HttpWorker';
  }

  public async version(): Promise<any> {
    let version_info: any = await BaseWorker.prototype.version.call(this);
    return version_info;
  }

  public async before_crawl(context: Context | WorkerContext): Promise<any> {
    await super.before_crawl(context);

    if (this.restart_worker && this.crawl_num > 0) {
      await this.setup();
    }
  }

  /**
   * Set a new proxy and recreate Got() with default args
   *
   * @param options
   */
  public async get_proxy(options: ProxyOptions): Promise<void> {
    let fresh_proxy = await super.get_proxy(options);

    if (fresh_proxy) {
      this.proxy = fresh_proxy;
      await this.setup();
    }
  }

  /**
   * cleanup function for http workers.
   */
  public async cleanup() {
    if (this.newProxyUrl) {
      this.logger.verbose(`closeAnonymizedProxy(${this.newProxyUrl})`);
      await this.proxyChain.closeAnonymizedProxy(this.newProxyUrl, true);
    }
  }

  /**
   * Setup the http worker.
   */
  public async setup(): Promise<boolean> {
    await BaseWorker.prototype.setup.call(this);

    let user_agent = this.config.user_agent;

    if (this.config.random_user_agent) {
      user_agent = new this.UserAgent({deviceCategory: 'desktop'}).toString();
    }

    let accept_language_header = '';

    if (this.config.random_accept_language) {
      accept_language_header = getRandomAcceptLanguageHeader();
    }

    if (this.config.user_agent_options) {
      user_agent = new this.UserAgent(this.config.user_agent_options).toString();
    }

    let headers: any = {
      'User-Agent': user_agent,
    };

    if (accept_language_header) {
      headers['Accept-Language'] = accept_language_header;
    }

    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }

    let options: any = {
      headers: headers,
      timeout: this.config.request_timeout,
      retry: 1, // https://www.npmjs.com/package/got#retry
    };

    // set certain cookies in the browser
    if (Array.isArray(this.config.cookies)) {
      let cookie_jar = new tough.CookieJar();
      for (let cookie of this.config.cookies) {
        this.logger.verbose(`Setting cookie: ${JSON.stringify(cookie)}`);
        let str_cookie = `${cookie.name}=${cookie.value}`;
        cookie_jar.setCookieSync(str_cookie, cookie.domain);
      }
      options.cookieJar = cookie_jar;
    }

    // https://github.com/koichik/node-tunnel
    if (this.proxy) {
      options.agent = getProxyAgent(this.proxy);
      // increase timeout when using proxies
      options.timeout = Math.max(options.timeout, 25000);
    }

    this.logger.verbose(JSON.stringify(options, null, 2));

    this.Got = Got.extend(options);
    return true;
  }

  public async clean_html(options: CleanHtmlOptions, html: string = ''): Promise<string> {
    let tags_to_strip = [];
    const allowed_tags = ['style', 'script', 'noscript'];
    if (options.tags && Array.isArray(options.tags)) {
      for (let tag of options.tags) {
        if (allowed_tags.includes(tag)) {
          tags_to_strip.push(tag);
        }
      }
    }

    this.logger.verbose(`Cleaning html: ${JSON.stringify(options)}`);

    if (tags_to_strip.includes('script')) {
      try {
        let replace_scripts = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
        html = html.replace(replace_scripts, '');
      } catch (err) {
        this.logger.error(`Error cleaning html from script: ${err}`)
      }
    }

    // @todo: this regex sucks
    if (tags_to_strip.includes('style')) {
      try {
        let replace_style = /<style>.*?<\/style>/gi;
        html = html.replace(replace_style, '');
      } catch (err) {
        this.logger.error(`Error cleaning html from style: ${err}`)
      }
    }

    return html;
  }

}
