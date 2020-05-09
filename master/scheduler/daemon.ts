import 'module-alias/register';
import {CrawlStatus, ICrawlTask, TaskHandler, WorkerType,} from "../src/models/crawltask.model";
import {QueueHandler} from "../src/models/queue.model";
import {IWorkerMetaHandler, WorkerMetaHandler} from "../src/models/workermeta.model";
import {IQueueStats} from "@lib/types/queue";
import {ProxyHandler} from "../src/models/proxy.model";
import {HARD_LIMIT_MAX_WORKERS} from "../src/constants/crawlTaskApi.constants";
import {mongoConnect} from '../src/db/db';
import {ClusterSize, WorkerAllocator} from './swarm_worker_allocator';
import {Config, getConfigDb} from './config';
import {ILoggingHandler, LoggingHandler} from "@lib/misc/logger";
import {ConfigHandler} from '../src/models/config';
import {CrawlRunner} from './runner';

export const __VERSION__: string = 'v1.3';

export class Scheduler {
  log_handler: ILoggingHandler;
  config: Config;
  queue_handler: QueueHandler;
  qstats: IQueueStats;
  worker_meta_handler: IWorkerMetaHandler;
  worker_allocator: WorkerAllocator;
  task_handler: TaskHandler;
  crawl_runner: CrawlRunner;

  constructor() {}

  async setup() {
    await mongoConnect();
    await this.loadConfig();
    this.config.mongo_url = process.env.MONGODB_CONNECTION_URL;

    this.log_handler = new LoggingHandler(this.config.logging_root, 'scheduler', this.config.scheduler_loglevel);

    // load proxies from fixtures
    let handler = new ProxyHandler();
    await handler.loadProxies();

    this.task_handler = new TaskHandler();
    this.worker_allocator = new WorkerAllocator(this.config, false);
    await this.worker_allocator.setupWorkerAllocator();
  }

  public async loadConfig() {
    this.config = await getConfigDb();
    if (!this.config) {
      console.error('Could not load config from db. Aborting.');
      process.exit(1);
    }
  }

  /**
   * Run in a endless loop and `sleep` in between cycles.
   *
   * Reloads config from db every 7 iterations in case the user
   * updated the config.
   * @todo: Better to use a push notification when the config
   * @todo: was updated by the api.
   */
  public async start() {
    let iterations: number = 0;
    // save start date of the scheduler
    let config_handler = new ConfigHandler();
    await config_handler.update({
      scheduler_started: new Date(),
    });

    while (true) {
      if (iterations > 0 && iterations % 7 === 0) {
        await this.loadConfig();
        this.log_handler.setLogLevel(this.config.scheduler_loglevel);
        this.log_handler.logger.info(`Reloaded config after ${iterations} cycles.`);
      }
      await this.run();
      await this.sleep(this.config.daemon_heartbeat);
      iterations++;
    }
  }

  public sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if the task is finished.
   *
   * The only way to check if a crawl task is finished is to see
   * if all the items in the queue were crawled.
   *
   * Failed items with item.retries <= task.retry_failed_items
   * do not count as failed, we count them as temporarily_failed
   *
   * @param task
   */
  private async taskFinished(task: ICrawlTask): Promise<boolean> {
    if (task.longliving) {
      this.log_handler.logger.info(`[${task._id}] CrawlTask is long living and never finishes.`);
      return false;
    }

    // a task with initial items cannot be finished
    if (this.qstats.initial > 0) {
      return false;
    }

    let task_finished: boolean = await this.queue_handler.taskFinished(task);

    if (task_finished === true) {
      this.log_handler.logger.info(`[${task._id}] CrawlTask is completed! ${this.qstats.completed} items were crawled in ${task.num_crawl_workers_started} worker invocations.`);
      task.status = CrawlStatus.completed;
      await task.save();
    }
    return task_finished;
  }

  /**
   * Make a basic sanity check of the current task.
   *
   * When the task is in inconsistent state, deactivate the task
   * to prevent any damage by setting the status to CrawlStatus.failed
   *
   * @param task
   *
   * @return return true if task should be quarantined
   */
  private async taskIsUnhealthy(task: ICrawlTask): Promise<boolean> {
    let is_unhealthy: boolean = false;

    if (task.num_workers_running < 0) {
      this.log_handler.logger.error(`[${task._id}] task.num_workers_running = ${task.num_workers_running} is negative.`);
      is_unhealthy = true;
      task.num_workers_running = 0;
    }

    if (task.num_workers_running > 200) {
      this.log_handler.logger.error(`[${task._id}] task.num_workers_running = ${task.num_workers_running} is too large.`);
      is_unhealthy = true;
    }

    // if more than `max_lost_workers_ratio` workers didn't respond
    // and more than `max_lost_workers` were lost in total, abort.
    // this is a security mechanism to prevent a ill task from running
    // endlessly
    let ratio = task.num_lost_workers / task.num_crawl_workers_started;
    if (ratio >= this.config.max_lost_workers_ratio && task.num_lost_workers >= task.max_lost_workers) {
      this.log_handler.logger.error(`[${task._id}] ${task.num_lost_workers}/${task.num_crawl_workers_started} were lost.`);
      is_unhealthy = true;
    }

    if (is_unhealthy) {
      this.log_handler.logger.error(`[${task._id}] task failed. Disabling task.`);
      task.status = CrawlStatus.failed;
      await task.save();
    }

    return is_unhealthy;
  }

  /**
   * Handle the meta data of running and paused worker instances.
   *
   * Essentially, we need to do the following:
   *
   * 1. Find workers that recently finished. Decrement num_workers_running by one.
   *
   * 2. Detect lost workers. Method: Find worker meta that was not set to status completed after a certain time interval passed.
   *
   * 3. Heal the queue from items stuck in state `running` on worker loss or worker problems.
   *
   * 4. enqueue failed items when there is no item currently running and retries is below a certain number.
   *
   * @param task
   */
  private async processWorkerMeta(task: ICrawlTask): Promise<void> {
    this.worker_meta_handler = new WorkerMetaHandler(task.worker_meta);

    let num_workers_updated = await this.worker_meta_handler.updateState(task);
    this.log_handler.logger.verbose(`[${task._id}] Updated state from ${num_workers_updated} worker meta.`);

    let threshold_minutes = task.whitelisted_proxies ? this.config.worker_lost_threshold_docker_minutes :
      this.config.worker_lost_threshold_minutes;

    await this.worker_meta_handler.detectLostWorkers(task, threshold_minutes);

    await this.worker_meta_handler.healQueue(task, this.queue_handler, this.qstats.running);

    if (this.qstats.failed > 0 && this.qstats.running === 0) {
      let enqueue_info = await this.queue_handler.enqueueFailedItems(task);
      if (enqueue_info) {
        this.log_handler.logger.verbose(`[${task._id}] Enqueued failed items: ${JSON.stringify(enqueue_info)}`);
        this.qstats = await this.queue_handler.getQueueStatistics(task);
      }
    }
  }

  /**
   * Retrieve the tasks from the db and order them according to
   * priority scheduling.
   */
  private async getTasks(): Promise<Array<ICrawlTask>> {
    // get tasks with status started
    let tasks = await this.task_handler.task_model.find({
      status: {$in: [CrawlStatus.started, CrawlStatus.paused]},
    });

    let num_running = 0;
    let num_paused = 0;

    for (let task of tasks) {
      if (task.status === CrawlStatus.started) {
        num_running++;
      } else if (task.status === CrawlStatus.paused) {
        num_paused++;
      }
    }

    this.log_handler.logger.info(`Got ${num_running} running tasks and ${num_paused} paused tasks.`);

    if (this.config.priority_policy === 'absolute') {
      // just remove all tasks from the array with a lower than max priority
      let max_priority = 0;
      for (let task of tasks) {
        max_priority = Math.max(max_priority, task.priority);
      }
      tasks = tasks.filter((task: ICrawlTask) => task.priority >= max_priority);
    } else if (this.config.priority_policy === 'relative') {
      // What is a relative priority algorithm?
      // Right now we just want to handle tasks with higher priority first
      // if in the future more resource bottlenecks arise, we might make
      // the priority restrictions more specific.
      tasks.sort((a: ICrawlTask, b: ICrawlTask): number => {
        if (a.priority > b.priority) {
          return 1;
        }
        if (a.priority < b.priority) {
          return -1;
        }
        return 0;
      });
    }

    return tasks;
  }

  /**
   * Detect when to terminate running docker crawler machines.
   *
   * Why do we need to terminate them? => They cost us money.
   *
   * 1. We terminate machines if there are 0 tasks running that need
   * docker crawlers.
   *
   * 2. Additionally, we terminate machines if all tasks that can use
   * docker crawlers have num_workers_running set to 0.
   */
  private async shouldWeKillMachines(): Promise<void> {
    for (let worker_type of [WorkerType.http, WorkerType.browser]) {
      // are there any pending tasks of this type?
      let pending_tasks = await this.task_handler.task_model.find({
        worker_type: worker_type,
        status: {$in: [CrawlStatus.completed, CrawlStatus.paused]},
        whitelisted_proxies: true,
      }).lean();

      let all_pending_tasks_finished: boolean = true;

      // check if no worker is running for this task type
      for (let task of pending_tasks) {
        if (task.num_workers_running > 0) {
          all_pending_tasks_finished = false;
          break;
        }
      }

      let running_tasks = await this.task_handler.task_model.countDocuments({
        worker_type: worker_type,
        status: CrawlStatus.started,
        whitelisted_proxies: true,
      });

      if (all_pending_tasks_finished && running_tasks <= 0) {
        this.log_handler.logger.verbose(`Attempting to destroy machines for worker type ${worker_type}.`);
        await this.worker_allocator.cleanupAll(worker_type);
      }
    }

    if (this.config.force_remove_machines) {
      this.log_handler.logger.warn(`Forcefully removing all machines`);
      // set all tasks to paused
      let update_info = await this.task_handler.task_model.updateMany({
        whitelisted_proxies: true,
        status: CrawlStatus.started
      }, {
        status: CrawlStatus.paused
      });

      if (update_info) {
        this.log_handler.logger.warn(`Paused all tasks running on docker: ${JSON.stringify(update_info)}`);
        // cleanup all machines
        await this.worker_allocator.cleanupAll();
      }
    }
  }

  private async run() {
    await this.shouldWeKillMachines();

    let tasks = await this.getTasks();

    for (let task of tasks) {
      this.queue_handler = new QueueHandler(task.queue);
      this.qstats = await this.queue_handler.getQueueStatistics(task);

      this.log_handler.logger.info(`[${task._id}] Queue state: ${JSON.stringify(this.qstats)}`);

      // is the task finished?
      if (await this.taskFinished(task)) {
        continue;
      }

      // process worker metadata
      await this.processWorkerMeta(task);

      // See if the task is unhealthy
      if (await this.taskIsUnhealthy(task)) {
        continue;
      }

      // if the task is not in state `started`, continue
      if (task.status !== CrawlStatus.started) {
        continue;
      }

      // do we need to start more lambda workers?
      let max_concurrent_workers = await this.task_handler.maxWorkersConcurrentlyRunning(task);

      this.log_handler.logger.info(`[${task._id}] ${task.num_workers_running}/${max_concurrent_workers} ${task.worker_type} workers already running.`);
      this.log_handler.logger.info(`[${task._id}] ${this.qstats.completed+this.qstats.failed}/${task.num_items} items crawled in ${task.num_crawl_workers_started} worker invocations.`);

      let num_workers_to_launch = max_concurrent_workers - task.num_workers_running;

      if (task.max_workers && task.max_workers >= 0) {
        // limit the num workers to the tasks max_workers
        num_workers_to_launch = Math.min(num_workers_to_launch, task.max_workers);
      }

      if (this.qstats.initial <= 0) {
        num_workers_to_launch = 0;
        this.log_handler.logger.verbose(`[${task._id}] Not starting new workers: All items crawled or currently running.`);
      }

      if (num_workers_to_launch > HARD_LIMIT_MAX_WORKERS) {
        this.log_handler.logger.warn(`[${task._id}] Not starting new workers: ${num_workers_to_launch} is suspiciously high.`);
        continue;
      }

      if (num_workers_to_launch > 0) {
        let num_workers_started = await this.makeProgress(task, num_workers_to_launch);

        if (num_workers_started > 0) {
          task.num_workers_running += num_workers_started;
          task.num_crawl_workers_started += num_workers_started;
        }

        await task.save();
      }

      console.log();
    }
  }

  /**
   *
   * Makes progress on a task.
   *
   * Either launches aws lambda workers or spawns a docker cluster of crawlers instances.
   *
   * @param task
   * @param num_workers_to_launch
   */
  private async makeProgress(task: ICrawlTask, num_workers_to_launch: number): Promise<number> {
    let num_machines = (task.worker_type === WorkerType.browser)
      ? this.config.num_machines_browser : this.config.num_machines_http;

    if (!num_machines) {
      num_machines = 1;
    }

    this.crawl_runner = new CrawlRunner(this.config, task, this.qstats, this.config.scheduler_loglevel);

    if (task.whitelisted_proxies) {
      if (this.config.force_remove_machines) {
        this.log_handler.logger.warn(`Cannot allocate machines, force_remove_machines=${this.config.force_remove_machines}`);
        return 0;
      } else {
        await this.worker_allocator.allocate(
          task.worker_type,
          num_machines,
          this.config.cluster_size || ClusterSize.large
        );
        let endpoints = await this.worker_allocator.getApiEndpoints(task);
        return await this.crawl_runner.runDocker(num_workers_to_launch, endpoints);
      }
    } else {
      return await this.crawl_runner.runAwsLambda(num_workers_to_launch);
    }
  }
}