import mongoose from 'mongoose';
import {Config} from '../../scheduler/config';
import {LogLevel, LoggingHandler} from '@lib/misc/logger';
import {IEip} from "./machine.model";

enum ClusterSize {
  small = 'small', // t2.small
  medium = 'medium', // t2.medium
  larger = 'larger', // t2.large, 2vCPU, 8G RAM
  large = 'large', // t2.xlarge, 4vCPU, 16G RAM
  huge = 'huge', // t2.2xlarge, 8vCPU, 32G RAM
}

const default_config: Config = {
  name: "prod-config",
  daemon_heartbeat: 10000,
  browser_lambda_arn: "arn:aws:lambda:{region}:672736483160:function:crawler-dev-browser-crawler",
  http_lambda_arn: "arn:aws:lambda:{region}:672736483160:function:crawler-dev-http-crawler",
  mongo_url: "mongodb://{mongo_user}:{mongo_pass}@{mongo_host}/",
  num_items_browser: 15,
  num_items_http: 30,
  logging_root: "/var/log/crawling_infra/",
  max_lost_workers_ratio: 0.01,
  worker_lost_threshold_minutes: 10,
  worker_lost_threshold_docker_minutes: 20,
  purge_worker_meta_after_minutes: 5,
  priority_policy: "absolute",
  random_region: true,
  worker_loglevel: LogLevel.info,
  scheduler_loglevel: LogLevel.info,
  num_machines_browser: 2,
  num_machines_http: 1,
  cluster_size: ClusterSize.large,
  retry_failed_items: 3,
  max_crawling_time_lambda: 240,
  api_max_concurrency: 100,
  regions: [
    {
      "region": "us-east-1",
      "bucket": "crawling-us-east-1",
      "country": "us",
    },
    {
      "region": "us-east-2",
      "bucket": "crawling-us-east-2",
      "country": "us",
    },
    {
      "region": "us-west-1",
      "bucket": "crawling-us-west-1",
      "country": "us",
    },
    {
      "region": "us-west-2",
      "bucket": "crawling-us-west-2",
      "country": "us",
    },
    {
      "region": "eu-central-1",
      "bucket": "crawling-eu-central-1",
      "country": "de",
    },
    {
      "region": "eu-west-1",
      "bucket": "crawling-eu-west-1",
      "country": "ir",
    },
    {
      "region": "eu-west-2",
      "bucket": "crawling-eu-west-2",
      "country": "uk",
    },
    {
      "region": "eu-west-3",
      "bucket": "crawling-eu-west-3",
      "country": "fr",
    },
    {
      "region": "ap-northeast-1",
      "bucket": "crawling-ap-northeast-1",
      "country": "jp",
    },
    {
      "region": "ap-northeast-2",
      "bucket": "crawling-ap-northeast-2",
      "country": "kr",
    },
    {
      "region": "ap-south-1",
      "bucket": "crawling-ap-south-1",
      "country": "in",
    },
    {
      "region": "ap-southeast-1",
      "bucket": "crawling-ap-southeast-1",
      "country": "sg",
    },
    {
      "region": "ap-southeast-2",
      "bucket": "crawling-ap-southeast-2",
      "country": "au",
    }
  ],
  restrict_demo_access: false,
  max_function_code_size: 25000,
  whitelisted_demo_functions: {
    'google_scraper.js': 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/google_scraper.js',
    'bing_scraper.js': 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/bing_scraper.js',
    'amazon.js': 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/amazon.js',
    'screenshot.js': 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/screenshot.js',
    'pdf.js': 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/pdf.js',
    'nytimes.js': 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/nytimes.js',
    'leads.js': 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/leads.js',
  },
  elastic_ips: [
    {
      eid: 'eipalloc-0cb69a846538eb5b6',
      ip: '52.204.14.197',
      used: false,
    },
    {
      eid: 'eipalloc-0ca6f6efc3b2d244f',
      ip: '52.7.191.184',
      used: false,
    },
  ],
  force_remove_machines: false,
  debug_info_threshold: 0.1,
  max_debug_info: 50,
  scheduler_started: undefined,
};

export interface IElasticIp extends mongoose.Document {
  eid: string;
  ip: string;
  used: boolean;
}

const ElasticIpSchema = new mongoose.Schema({
  eid: {
    type: String,
    required: true,
    unique: true,
  },
  ip: {
    type: String,
    required: true,
  },
  used: {
    type: Boolean,
    default: false,
  },
});

const ConfigSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  daemon_heartbeat: {
    type: Number,
    default: 10000,
    min: 5000,
  },
  browser_lambda_arn: {
    type: String,
  },
  http_lambda_arn: {
    type: String,
  },
  mongo_url: {
    type: String,
  },
  num_items_browser: {
    type: Number,
  },
  num_items_http: {
    type: Number,
  },
  logging_root: {
    type: String,
  },
  max_lost_workers_ratio: {
    type: Number,
  },
  worker_lost_threshold_minutes: {
    type: Number,
  },
  worker_lost_threshold_docker_minutes: {
    type: Number,
  },
  purge_worker_meta_after_minutes: {
    type: Number,
  },
  priority_policy: {
    type: String,
  },
  random_region: {
    type: Boolean,
  },
  worker_loglevel: {
    type: String,
  },
  scheduler_loglevel: {
    type: String,
  },
  num_machines_browser: {
    type: Number,
  },
  num_machines_http: {
    type: Number,
  },
  cluster_size: {
    type: ClusterSize,
  },
  retry_failed_items:{
    type: Number,
  },
  max_crawling_time_lambda: {
    type: Number,
  },
  api_max_concurrency: {
    type: Number,
  },
  regions: {
    type: Object,
    required: false,
  },
  restrict_demo_access: {
    type: Boolean,
    default: false,
  },
  max_function_code_size: {
    type: Number,
    default: 10000,
  },
  whitelisted_demo_functions: {
    type: Object,
  },
  elastic_ips: {
    type: [ElasticIpSchema],
    required: false,
  },
  force_remove_machines: {
    type: Boolean,
    required: false,
  },
});

export interface IConfigDoc extends mongoose.Document, Config {}

export class ConfigHandler {
  config_model: any;
  logger: any;

  constructor() {
    const Db = mongoose.connection.useDb('CrawlMaster');
    this.config_model = Db.model<IConfigDoc>('config', ConfigSchema);
    this.logger = (new LoggingHandler(null, 'config')).logger;
  }

  /**
   * Create the default configuration.
   */
  public async createConfig() {
    await this.config_model.findOneAndUpdate({name: 'prod-config'}, default_config, { new: true, upsert: true});
    let cfg = await this.getConfig();
    for (let eip of cfg.elastic_ips) {
      eip.used = false;
    }
    await cfg.save();
    return cfg;
  }

  public async getConfig(): Promise<IConfigDoc | null> {
    return await this.config_model.findOne({name: 'prod-config'});
  }

  /**
   * Update the configuration.
   *
   * @param update
   */
  public async update(update: any) {
    return await this.config_model.findOneAndUpdate({name: 'prod-config'}, update, {new: true, upsert: false});
  }

  /**
   * Drop the machine collection.
   */
  public async drop() {
    await this.config_model.collection.drop();
  }

  /**
   * Returns an elastic ip and mark it as used.
   */
  public async getElasticIp() {
    let config = await this.getConfig();

    if (!Array.isArray(config.elastic_ips)) {
      this.logger.error('No elastic_ips in config.');
      return null;
    }

    for (let eip of config.elastic_ips) {
      if (!eip.used) {
        eip.used = true;
        await config.save();
        this.logger.info(`Allocated eip ${eip.ip}`);
        return eip;
      }
    }
    return null;
  }

  /**
   * Set `used` property of elastic ip to false
   */
  public async freeElasticIp(reference: IEip) {
    let config = await this.getConfig();

    if (!Array.isArray(config.elastic_ips)) {
      this.logger.error('No elastic_ips in config.');
      return false;
    }

    for (let eip of config.elastic_ips) {
      if (eip.eid === reference.eid) {
        eip.used = false;
        await config.save();
        this.logger.info(`Freed eip ${reference.ip}`);
        return true;
      }
    }

    return false;
  }
}