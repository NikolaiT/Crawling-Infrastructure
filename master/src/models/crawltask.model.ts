import mongoose from 'mongoose';
import {average} from "@lib/misc/stats";
import {MIN_AVG_IPS} from '../constants/crawlTaskApi.constants';
import {ProxyOptions} from '@lib/types/proxy';

/**
 * See example mongoose schema:
 * https://gist.github.com/brennanMKE/ee8ea002d305d4539ef6
 */

export enum InvocationType {
  request_response = 'request_response',
  event = 'event'
}

export enum WorkerType {
  http = 'http',
  browser = 'browser',
}

export enum CrawlStatus {
  started = 'started',
  completed = 'completed',
  failed = 'failed',
  paused = 'paused'
}

export enum StoragePolicy {
  // stores each item with item._id as key and result value in a single s3 file
  itemwise = 'itemwise',
  // merges items with JSON.stringify() and stores as combined file of all results
  merged = 'merged',
}

export enum PriorityPolicy {
  // higher priority task will consume
  // all workers until the tasks are finished
  // task with priority 1 will only be considered when
  // a task with priority 2 is finished.
  absolute = 'absolute',
  // all tasks will receive crawling
  // resources according to their priority number
  // 1 is lowest priority, 10 is highest priority
  // a task with priority 1 will receive a 1/10 of
  // lambda workers of a task with priority 10
  relative = 'relative'
}

export interface IRegion extends mongoose.Document {
  region: string;
  bucket: string;
}

export interface ICrawlOptions extends mongoose.Document {
  // all requests are done with this user agent
  user_agent?: string;
  headers?: any;
  // when set to true, a random user agent is chosen of type `desktop`
  random_user_agent?: boolean;
  // setting the user agent options for https://www.npmjs.com/package/user-agents
  // example: {deviceCategory: 'mobile'}
  user_agent_options: any;
  // the default http request timeout for got
  request_timeout?: number;
  // an array of cookies. Each cookie must have the
  // properties cookie.name, cookie.value and cookie.domain
  cookies?: Array<any>;
  // the viewport size of the headless browser
  viewport?: any;
  // default navigation timeout. Default is 30s.
  default_navigation_timeout?: number;
  // pass additional params to puppeteer
  pup_args?: Array<string>;
  // whether to intercept certain media types when using puppeteer
  intercept_types?: Array<string>;
  // whether the module https://www.npmjs.com/package/puppeteer-extra-plugin-stealth should be used
  // to hide the headless chromium browser
  apply_evasion?: boolean;
  // user data dir for puppeteer scraper
  user_data_dir?: string;
  // whether to block webrtc requests
  block_webrtc?: boolean;
  // whether a random user data dir should be used
  random_user_data_dir?: boolean;
  // proxy options of this crawl task
  proxy_options: ProxyOptions;
  // proxies
  proxies: Array<string>;
}

export const crawl_options_keys: Array<string> = [
  'user_agent',
  'headers',
  'random_user_agent',
  'user_agent_options',
  'request_timeout',
  'cookies',
  'viewport',
  'default_navigation_timeout',
  'pup_args',
  'intercept_types',
  'apply_evasion',
  'user_data_dir',
  'block_webrtc',
  'random_user_data_dir',
  'proxy_options',
  'proxies',
];

// Define the crawl options schema type
let CrawlOptionsSchema = new mongoose.Schema({
  user_agent: {
    type: String,
    required: false,
    default: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.105 Safari/537.36"
  },
  headers: {
    type: Array,
    required: false,
    default: null,
  },
  random_user_agent: {
    type: Boolean,
    required: false,
    default: false,
  },
  user_agent_options: {
    type: Object,
    required: false,
  },
  request_timeout: {
    type: Number,
    required: false,
    default: 15000,
  },
  cookies: {
    type: Array,
    required: false,
    default: null,
  },
  viewport: {
    type: Object,
    required: false,
    default: {width: 1900, height: 1024},
  },
  default_navigation_timeout: {
    type: Number,
    required: false,
    default: 50000,
  },
  pup_args: {
    type: Array,
    required: false,
    default: null,
  },
  intercept_types: {
    type: Array,
    required: false,
    default: null,
  },
  apply_evasion: {
    type: Boolean,
    required: false,
    default: false,
  },
  user_data_dir: {
    type: String,
    required: false,
  },
  block_webrtc: {
    type: Boolean,
    required: false,
  },
  random_user_data_dir: {
    type: Boolean,
    required: false,
    default: false,
  },
  proxy_options: {
    type: Object,
    required: false,
  },
  proxies: {
    type: Array,
    required: false,
  }
});

export interface ICrawlTask extends mongoose.Document {
  // the tasks name
  name: string;
  // the tasks status
  status: CrawlStatus;
  // a task that is `longliving` receives items from the outside
  // we never know when the task is finished, therefore it is `longliving`
  longliving: boolean;
  // the task invocation type
  invocation_type: InvocationType;
  worker_type: WorkerType;
  // the total number of started lambda workers as seen from the daemon
  num_crawl_workers_started: number;
  // how many workers are currently running for this task. This is a synchronization counter
  // @todo: there are probably race conditions occurring here
  num_workers_running: number;
  // maximal number of workers a task can start per iteration
  max_workers: number;
  // this is a incrementing counter to enumerate the launched workers
  // this is is only incremented when attempting to launch a new worker
  // worker_id is only incremented by the daemon master
  worker_id: number;
  // total number of lost workers
  num_lost_workers: number;
  // how many workers a task is allowed to lose before aborting it
  max_lost_workers: number;
  // upper limit of items per worker
  max_items_per_worker: number;
  function: string;
  function_code: string;
  // name of the queue collection belonging to this task
  queue: string;
  // name of the worker meta collection that belongs to this task
  worker_meta: string;
  num_items: number;
  // number of items successfully crawled
  num_items_crawled: number;
  // an array of regions that this crawl task is all
  regions: IRegion[];
  priority: number;
  priority_policy: PriorityPolicy;
  // items/second that the target is being crawled with
  max_items_per_second: number;
  // this is an array of all items per second measurements of all workers
  avg_items_per_second_worker: number[];

  // how many times should we retry failed items?
  retry_failed_items: number;

  // options passed to the workers
  crawl_options: ICrawlOptions;

  // options passed to the crawling worker
  options: any;

  // whether the task will be allocate in a docker swarm with Elastic IP's
  whitelisted_proxies: boolean;

  // how to store items, combined or single
  storage_policy: StoragePolicy;

  // whether to log the ip address of the crawl worker
  log_ip_address: boolean;

  // how many debug information elements were uploaded
  items_browser_debug: Array<string>;

  createdAt: Date;
  updatedAt: Date;
}

let RegionSchema = new mongoose.Schema({
  region: {
    type: String,
    required: true
  },
  bucket: {
    type: String,
    required: true
  },
});

let CrawlTaskSchema = new mongoose.Schema({
    name: {
      type: String,
      required: false,
    },
    status: {
      type: CrawlStatus,
      required: true,
      default: CrawlStatus.started
    },
    longliving: {
      type: Boolean,
      required: false,
      default: false,
    },
    invocation_type: {
      type: InvocationType,
      required: true,
      default: InvocationType.event,
    },
    worker_type: {
      type: WorkerType,
    },
    // workers created by the daemon
    num_crawl_workers_started: {
      type: Number,
      default: 0,
      min: 0,
    },
    // keeps track how many workers are currently running
    num_workers_running: {
      type: Number,
      default: 0,
      min: 0,
    },
    max_workers: {
      type: Number,
      default: null,
      required: false
    },
    worker_id: {
      type: Number,
      default: 0,
      min: 0,
    },
    // total number of lost workers
    num_lost_workers: {
      type: Number,
      default: 0,
      min: 0,
    },
    // how many workers a task is allowed to lose before aborting it
    max_lost_workers: {
      type: Number,
      default: 10,
      min: 0,
    },
    max_items_per_worker: {
      type: Number,
      default: null,
      required: false,
    },
    function: {
      type: String,
      required: false,
    },
    function_code: {
      type: String,
      required: true
    },
    queue: {
      type: String,
      required: false
    },
    // name of the worker meta collection that belongs to this task
    worker_meta: {
      type: String,
      required: false
    },
    // total number of items in the queue_handler
    num_items: {
      type: Number,
      default: 0,
      required: false,
      min: 0,
    },
    num_items_crawled: {
      type: Number,
      default: 0,
      required: false,
      min: 0,
    },
    regions: {
      type: [RegionSchema],
      required: false,
      default: [],
    },
    // higher priority means tasks are preferred compared lower priority task
    priority: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 10,
    },
    priority_policy: {
      type: PriorityPolicy,
      default: PriorityPolicy.absolute,
    },
    // the overall throughput in items/second that a target website
    // should be crawled with. By default 1/item per second.
    max_items_per_second: {
      type: Number,
      required: false,
      default: 1.0,
      min: 0.001,
      max: 200,
    },
    // the average number of requests/second for a single worker
    // https://stackoverflow.com/questions/35509611/mongoose-save-array-of-strings
    avg_items_per_second_worker: {
      type: [Number],
      required: false,
      default: [],
    },
    // retry all items that are failed below retries counter
    // if retry_failed_items=2, then all failed items with retry
    // counter < 2 will be enqueued
    retry_failed_items: {
      type: Number,
      required: false,
      default: 3,
    },
    crawl_options: {
      type: CrawlOptionsSchema,
      required: false,
    },
    options: {
      type: Object,
      required: false,
    },
    whitelisted_proxies: {
      type: Boolean,
      required: false,
      default: false,
    },
    storage_policy: {
      type: StoragePolicy,
      required: false,
      default: StoragePolicy.itemwise,
    },
    log_ip_address: {
      type: Boolean,
      default: false,
    },
    items_browser_debug: {
      type: [String],
      required: false,
      default: [],
    },
  },
  // https://stackoverflow.com/questions/12669615/add-created-at-and-updated-at-fields-to-mongoose-schemas
  {
    timestamps: {createdAt: 'createdAt', updatedAt: 'updatedAt'}
  });

export class TaskHandler {
  task_model: ICrawlTaskModel;

  constructor() {
    const Db = mongoose.connection.useDb('CrawlMaster');
    this.task_model = <ICrawlTaskModel>Db.model<ICrawlTask>("CrawlTask", CrawlTaskSchema);
  }

  /**
   * Compute the numbers of workers required to
   * achieve the max_items_per_second crawling speed
   */
  public async maxWorkersConcurrentlyRunning(task: ICrawlTask) {
    let average_items_per_second = 0.2;

    if (task.avg_items_per_second_worker.length <= 0) {
      // assume that one worker achieves the following speeds
      average_items_per_second = (task.worker_type === WorkerType.browser ? 0.2 : 0.5);
    } else {
      // compute average over array of past measurements
      average_items_per_second = average(task.avg_items_per_second_worker);
    }

    // sometimes our function fails and avg_rps is extremely small value,
    // which results in a large number of workers allocated. To prevent that,
    // use a minimal value of avg_rps
    if (average_items_per_second < MIN_AVG_IPS) {
      console.error(`avg_rps is really small: ${average_items_per_second}. Are the workers failing?`);
      average_items_per_second = MIN_AVG_IPS;
    }

    let num_workers = task.max_items_per_second / average_items_per_second;

    if (num_workers <= 1) {
      num_workers = 1;
    } else {
      // Math.floor because we rather don't overshoot over max items per second threshold
      num_workers = Math.floor(num_workers);
    }

    return num_workers;
  }

  async getTotalItems(): Promise<number> {
    let total_items: number = 0;

    for (let task of await this.task_model.find({})) {
      total_items += task.num_items;
    }

    return total_items;
  }

  async getTotalTasks(): Promise<number> {
    return await this.task_model.find({}).lean().count();
  }

  static getWorkerType (task: ICrawlTask): string {
    return task.worker_type === WorkerType.browser ? 'browser' : 'http';
  }
}


export interface ICrawlTaskModel extends mongoose.Model<ICrawlTask> {
}

export interface IRegionModel extends mongoose.Model<IRegion> {
}
export let RegionModel: IRegionModel = <IRegionModel>mongoose.model<IRegion>('Region', RegionSchema);
