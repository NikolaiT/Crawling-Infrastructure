import fs from "fs";
import {system} from "@lib/misc/shell";
import {ProxyHandler} from "../models/proxy.model";
import {ProxyStatus, ProxyType} from "@lib/types/proxy";
import path from "path";
import url from "url";
import zlib from "zlib";
import {RegionModel, TaskHandler} from "../models/crawltask.model";
import {Logger} from "@lib/misc/logger";
import {Config} from "../../scheduler/config";
let appRoot = require('app-root-path');
const got = require('got');

export enum CrawlProfile {
  // in order to bypass cloudflare anti bot protection
  cloudflare = 'cloudflare',
  // simple http curl requests
  curl = 'curl',
  // mimicking mobile phone behavior
  mobile_proxy = 'mobile_proxy'
}


export async function checkItems(logger: Logger, items: any): Promise<any> {
  if (Array.isArray(items)) {
    if (items.length > 0) {
      logger.debug('items is an non-empty array');
      return;
    } else {
      return {error: 'items is an empty array'}
    }
  } else {
    if (fs.existsSync(items)) {
      logger.info('items is a local file');
      return;
    } else {
      try {
        // make a head request to the items source
        let response = await system(`curl -I ${items}`);
        if (response.stdout.includes('Content-Length') || response.stdout.includes('ETag')) {
          logger.info('items is a valid url');
          return;
        }
      } catch (err) {
        return {error: 'items is not a valid url: ' + items}
      }
    }
  }
  return {error: 'items source is neither an array/local file/url'};
}


export async function profileAllowed(logger: Logger, profile: CrawlProfile): Promise<any> {
  // if we crawl with profile CrawlProfile.mobile_proxy
  // check that at least one such proxy is available
  if (profile === CrawlProfile.mobile_proxy) {
    let proxy_handler = new ProxyHandler();
    // at least one functional mobile proxy
    let mobile_proxies = await proxy_handler.getAll({
      status: ProxyStatus.functional,
      type: ProxyType.mobile,
    }, {});

    if (mobile_proxies.length <= 0) {
      return {error: 'No mobile proxy available. Unable to create this crawl task.'};
    } else {
      logger.info(`${mobile_proxies.length} mobile proxies available. Profile ${profile} allowed.`);
    }
  } else {
    return {error: `Profile ${profile} does not exist.`};
  }
}

export function configureCrawlProfile(logger: Logger, profile: CrawlProfile, crawl_task: any) {
  if (profile) {
    logger.info(`Configuring crawling profile: ${profile}`);
  }

  if (profile === CrawlProfile.cloudflare) {
    crawl_task.whitelisted_proxies = true;
    crawl_task.crawl_options = {
      default_navigation_timeout: 60000,
      apply_evasion: true,
      random_user_agent: true,
      random_user_data_dir: true,
      block_webrtc: true,
      user_agent_options: {
        deviceCategory: 'desktop'
      }
    }
  } else if (profile === CrawlProfile.curl) {
    crawl_task.crawl_options = {
      user_agent: 'curl/7.65.3',
      random_user_agent: false,
      request_timeout: 20000,
    }
  } else if (profile === CrawlProfile.mobile_proxy) {
    crawl_task.whitelisted_proxies = true;
    crawl_task.crawl_options = {
      default_navigation_timeout: 60000,
      apply_evasion: true,
      random_user_agent: true,
      random_user_data_dir: true,
      block_webrtc: true,
      // use only mobile proxies
      user_agent_options: {
        deviceCategory: 'mobile', // request mobile user agent
      },
      proxy_options: {
        change: 10, // change on every 10th request
        filter: {
          type: ProxyType.mobile, // only allow mobile proxies
        }
      }
    }
  }
}

/**
 * Assign appropriate region based on the region parameter.
 *
 * @param task
 * @param obj
 */
export function assignRegions(config: Config, obj: any, task: any) {
  let region = obj.region || '';
  if (region) {
    region = region.toLowerCase();
  }

  // when region is set, only add matching regions from config
  // if region is not specified, add every region from config
  for (let config_region of config.regions) {
    if ((region === config_region.country) || !region) {
      task.regions.push(new RegionModel(config_region));
    }
  }
}


/**
 * First try to load the function from the local
 * functions repository clone. If that doesn't work,
 * download the url.
 *
 * Avoid at all costs too much latency, because API calls
 * need to be performant.
 *
 * @param function_str: Either a url or a filename
 */
export async function loadFunctionCode(logger: Logger, function_str: string) {
  // if the basename/filename of the url exists locally,
  // load function code from local file instead of making
  // an http request to the url.
  let crawler_name = path.basename(url.parse(function_str).pathname);
  if (crawler_name) {
    let local_file = path.join(appRoot.toString(), './crawl-data/scrapeulous-master/', crawler_name);
    if (fs.existsSync(local_file)) {
      logger.info(`Loading crawler code from disk: ${local_file}`);
      return fs.readFileSync(local_file).toString();
    } else {
      logger.error(`File ${local_file} does not exist.`);
    }
  }

  return await downloadMaybeGzipped(function_str);
}



/**
 * Download a file over htty.
 *
 * If the url ands with `.gz`/`.gzip`, try to gunzip it and
 * return the inflated text.
 */
export function downloadMaybeGzipped(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let is_gzipped = url.endsWith('.gz') || url.endsWith('.gzip');

    let options: any = {
      timeout: 20000,
      decompress: true,
    };

    // Encoding to be used on setEncoding of the response data.
    // If null, the body is returned as a Buffer (binary data).
    if (is_gzipped) {
      options['encoding'] = null;
    }

    got(url, options).then((response) => {
      console.log(`Loaded crawler code from url: ${response.body.length} bytes from ${url}`);
      if (is_gzipped) {
        zlib.gunzip(response.body, function (err, deflated) {
          if (err) {
            console.error(err.toString());
            reject(err);
          }
          if (deflated === undefined) {
            reject('Could not deflate response.body');
          }
          let text = deflated.toString();
          resolve(text);
        });
      } else {
        resolve(response.body);
      }
    }).catch((err) => {
      reject(err);
    });
  });
}

