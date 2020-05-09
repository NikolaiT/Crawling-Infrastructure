import mongoose from 'mongoose';
import {HttpWorkerConfig, BrowserWorkerConfig} from './config';
import {Logger, getLogger} from '@lib/misc/logger';
import {getProxyAgent, getRandomUserAgent, shuffle, getRandomAcceptLanguageHeader} from "./helpers";
const got = require('got');
import {ProxyType, ProxyStatus, ProxySchema} from "@lib/types/proxy";

export class ProxyHandler {
  config: HttpWorkerConfig | BrowserWorkerConfig;
  proxy_model: any;
  proxy_schema: any;
  logger: Logger;
  current_proxy_meta: any;

  constructor(config: HttpWorkerConfig | BrowserWorkerConfig) {
    this.config = config;
    this.logger = getLogger(null, 'proxy_handler', config.loglevel);

    this.proxy_schema = ProxySchema;

    let Db = mongoose.connection.useDb('CrawlMaster');
    this.proxy_model = Db.model("Proxy", this.proxy_schema);
    this.current_proxy_meta = null;
  }


  /**
   * Get the next more powerful proxy.
   *
   * @param type
   */
  private getNextProxyWaterfall(type: ProxyType): any {
    let waterfall = [
      ProxyType.datacenter, ProxyType.residential, ProxyType.mobile
    ];

    let index = waterfall.indexOf(type);

    if (index !== -1 && index < waterfall.length) {
      return waterfall[index + 1];
    } else {
      return null;
    }
  }

  /**
   * Update proxy status:
   *
   * @param: reason
   *  'blocked': Proxy was blocked
   *  'damaged': Cannot connect to proxy with provided config
   */
  public async updateProxy(proxy: any, reason: string) {
    try {
      let update = null;

      if (reason === 'blocked') {
        update = {
          'last_used': new Date(),
          'last_blocked': new Date(),
          $inc: { 'block_counter': 1 }
        }
      } else if (reason === 'damaged') {
        update = {
          'status': ProxyStatus.damaged,
          'last_used': new Date(),
        }
      } else if (reason === 'check_failed') {
        update = {
          'last_used': new Date(),
          $inc: { 'proxy_fail_counter': 1 }
        }
      }

      if (update) {
        let update_info = await this.proxy_model.updateOne({_id: proxy._id}, update).exec();
        this.logger.info(`Updated proxy ${proxy.proxy} to status ${reason}`);
      }

    } catch (err) {
      this.logger.error(err.toString());
    }
  }

  /**
   *
   * 1. get a fresh proxy with the correct filter
   * 2. Test if the proxy works. If it doesn't, mark it as damaged and request the next fresh proxy.
   * 3. Repeat step 2 up to 5 times.
   * 4. If no working proxy was found, abort the worker process and signal a `no available proxy` message in worker meta and meta
   *
   * If this function returns null, crawling must be aborted.
   *
   * @param filter
   */
  public async getFreshProxy(filter: any) {

    const max_attempts: number = 5;

    for (let i = 0; i < max_attempts; i++) {
      let proxy = await this.getProxy(filter);

      // if there is no proxy with this filter, we cannot proceed with
      // crawling. abort.
      if (!proxy) {
        return null;
      }

      let proxy_works: boolean = await this.checkProxy(proxy);

      if (proxy_works) {
        return proxy;
      } else {
        // signal back to the master
        // that this proxy does not work properly
        // do not deprecate this proxy, failure might be temporary
        await this.updateProxy(proxy, 'check_failed');
      }
    }

    // if no working proxy has been found, abort crawling
    return null;
  }

  private async getProxy(filter: any) {
    this.logger.verbose(`Get fresh proxy with filter: ${JSON.stringify(filter)}`);
    try {
      // https://mongoosejs.com/docs/api.html#query_Query-findOneAndUpdate
      return await this.proxy_model.findOneAndUpdate(
        filter,
        {
          'last_used': new Date(),
          $inc: { 'obtain_counter': 1 }
        }, {
          new: true,
          useFindAndModify: false,
          // what is ascending? https://www.kb.blackbaud.co.uk/articles/Article/117098
          // https://docs.mongodb.com/manual/reference/method/cursor.sort/
          // proxy_fail_counter ascending(1): proxies with low fail counter are picked first
          // last_used ascending(1): proxy least recently used (with the oldest date) is preferably used
          // block_counter ascending(1): proxy with the least blocks is used
          sort: {proxy_fail_counter: 1, last_used: 1, obtain_counter: 1},
        }
      ).lean();

    } catch (err) {
      this.logger.error(`Cannot get proxy: ${err.toString()}`);
    }
    return null;
  }

  /**
   * Quick check that the proxy works.
   *
   * The proxy works when the returned IP address differs from
   * our real public IP address.
   *
   * This method also sets meta information belonging to this proxy:
   * - timezone
   * - language/country
   *
   * Problem: Proxy might be rotating and uses a different endpoint for each request. Then this meta
   * information is not just useless, it's rather dangerous to set it.
   *
   * meta ip information apis:
   *
   * https://ipinfo.io/json
   * https://ipapi.co/json
   * https://freegeoip.app/json/
   *
   * @todo: In the long run we need our own rudimentary IP meta information API,
   * @todo: because those api providers might block us if we use it too much.
   *
   * @param proxy
   */
  public async checkProxy(proxy: any): Promise<boolean> {
    let api_urls = ['https://ipinfo.io/json', 'https://freegeoip.app/json/',
      'http://checkip.amazonaws.com/', 'http://lumtest.com/myip.json'];

    shuffle(api_urls);

    // if the proxy fails on two api's, consider it failed
    // one failure might be to an outage of a service above
    let failures_left = 2;

    for (let url of api_urls) {
      let options = {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept-Language': getRandomAcceptLanguageHeader(),
        },
        timeout: 9000, // we need a rather large timeout because proxies might be slow
        agent: getProxyAgent(proxy),
        retry: 0,
        json: true,
      };

      if (url === 'http://checkip.amazonaws.com/') {
        options.json = false;
      }

      try {
        let response = await got(url, options);
        if (response && response.body) {
          let meta: any = {
            ip: '',
            timezone: '',
            language: ''
          };

          if (url === 'https://ipinfo.io/json') {
            meta.ip = response.body['ip'];
            meta.timezone = response.body['timezone'];
            meta.language = response.body['country'];
          } else if (url === 'https://freegeoip.app/json/') {
            meta.ip = response.body['ip'];
            meta.timezone = response.body['time_zone'];
            meta.language = response.body['country_code'];
          } else if (url === 'http://checkip.amazonaws.com/') {
            meta.ip = response.body;
          } else if (url === 'http://lumtest.com/myip.json') {
            meta.ip = response.body['ip'];
            meta.timezone = response.body['geo']['tz'];
            meta.language = response.body['country'];
          }

          this.current_proxy_meta = meta;

          this.logger.debug(`reflected ip = ${meta.ip}, proxy = ${proxy.proxy}, public ip = ${this.config.public_ip}`);
          // the proxy works when it differs from our real public ip
          if (meta.ip.length > 0 && this.config.public_ip.length > 0 && this.config.public_ip !== meta.ip) {
            this.logger.verbose(`Proxy ${proxy.proxy} works`);
            return true;
          }
        }
      } catch (err) {
        failures_left--;
        this.logger.verbose(`[failures_left=${failures_left}] Proxy request to ${url} fails with: ${err.toString()}`);
        if (failures_left <= 0) {
          break;
        }
      }
    }

    this.logger.verbose(`Proxy ${proxy.proxy} is not working properly.`);
    return false;
  }
}