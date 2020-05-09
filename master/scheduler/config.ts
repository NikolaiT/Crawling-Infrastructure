import {ClusterSize} from "./swarm_worker_allocator";
import fs from "fs";
let appRoot = require('app-root-path');
import path from 'path';
import {ConfigHandler} from "../src/models/config";
import {IEip} from '../src/models/machine.model';
import {LogLevel} from '@lib/misc/logger';

export interface Config {
  name: string;
  // in what interval should the daemon poll tasks?
  daemon_heartbeat: number;
  // aws arn for browser workers
  browser_lambda_arn: string;
  // aws arn for http workers
  http_lambda_arn: string;
  // mongodb connection string template
  mongo_url: string;
  // num items a worker crawls in a browser invocation
  num_items_browser: number;
  // num items a worker crawls in a http invocation
  num_items_http: number;
  // logging root directory
  logging_root: string;
  // = lost_workers / total_workers
  // if this ratio is larger than max_lost_workers,
  // the tasked is failed and stopped
  max_lost_workers_ratio: number;
  // after how many minutes a worker is considered
  // to be lost
  worker_lost_threshold_minutes: number;
  // same for docker workers
  worker_lost_threshold_docker_minutes: number;
  // purge worker meta after this amount of minutes
  // the time reference point is worker_meta.ended
  purge_worker_meta_after_minutes: number;
  // priority policy, either absolute or relative
  priority_policy: string;
  // whether to pick a random region each time when crawling
  random_region: boolean;
  // logging level of the crawlers
  // See levels @scheduler_verbosity
  worker_loglevel: LogLevel;
  // logging level of the scheduler
  // we are using winston loglevels
  // https://github.com/winstonjs/winston#logging
  //   const levels = {
  //    error: 0,
  //    warn: 1,
  //    info: 2,
  //    http: 3,
  //    verbose: 4,
  //    debug: 5,
  //    silly: 6
  // };
  scheduler_loglevel: LogLevel;
  // num machines to allocate in case whitelisted_proxy is used
  // that support a browser
  num_machines_browser: number;
  // num machines to allocate that support exclusively http requests
  num_machines_http: number;
  // the size of the cluster
  cluster_size: ClusterSize;
  // how many times to retry failed items
  retry_failed_items: number;
  // how many seconds a lambda function is allowed to crawl
  max_crawling_time_lambda: number;
  // how many maximally concurrent functions
  api_max_concurrency: number;
  // an array of regions to use for AWS
  regions: any;
  // if true, will restrict demo access
  restrict_demo_access: boolean;
  // max size of function code
  max_function_code_size: number;
  // whitelisted demo functions
  whitelisted_demo_functions: any;
  // an array of elastic AWS IP's
  elastic_ips: Array<IEip>;
  // if set to true, will forcefully deallocate all docker machines
  force_remove_machines: boolean;
  // store debug when fail rate is large than
  // 0: no item failed, 1 all items failed
  debug_info_threshold: number;
  // how much debug info to store
  max_debug_info: number;
  // when the scheduler was started. Useful to compute the uptime.
  scheduler_started?: Date;
}

/**
 * The configuration is in ./scheduler/scheduler.conf.json
 *
 * @param config_path
 */
export function parseConfigFile(config_path: string = ''): any {
  if (!config_path) {
    config_path = path.join(appRoot.toString(), 'scheduler/scheduler.conf.json');
  }

  // parse the config file
  if (fs.existsSync(config_path) && config_path.endsWith('.json')) {
    let file_contents = fs.readFileSync(config_path).toString();
    return <Config>JSON.parse(file_contents);
  } else {
    console.error('Cannot find config file: ' + config_path);
    return null;
  }
}

/**
 * Load the default configuration from mongodb.
 */
export async function getConfigDb() {
  let config: Config | null = null;
  try {
    let config_handler = new ConfigHandler();
    config = await config_handler.getConfig();
  } catch(err) {
    console.error('Cannot load config from db: ' + err.toString());
  }
  return config;
}