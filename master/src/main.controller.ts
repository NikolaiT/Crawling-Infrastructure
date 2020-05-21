import {Application} from 'express';
import {CrawlTaskService} from './services/crawltask.service';
import {TestService} from './services/test.service';
import {auth, api_key_given} from './middleware/auth';
import {ProxyService} from "./services/proxy.service";
import {QueueService} from "./services/queue.service";
import {StatsService} from "./services/stats.service";
import {InfraService} from "./services/infra.service";
import {ApiService} from "./services/api.service";

export class Controller {
  task_service: CrawlTaskService;
  test_service: TestService;
  proxy_service: ProxyService;
  queue_service: QueueService;
  stats_service: StatsService;
  infra_service: InfraService;
  api_service: ApiService;

  constructor(private app: Application) {
    this.task_service = new CrawlTaskService();
    this.test_service = new TestService();
    this.proxy_service = new ProxyService();
    this.queue_service = new QueueService();
    this.stats_service = new StatsService();
    this.infra_service = new InfraService();
    this.api_service = new ApiService();
    this.routes();
    this.proxyRoutes();
    this.queueRoutes();
    this.statsRoutes();
    this.testRoutes();
    this.infraRoutes();
  }

  public async setup() {
    await this.task_service.setup();
    await this.api_service.setup();
  }

  private crawlRoutes() {
  }

  private proxyRoutes() {
    this.app.route('/proxies').post(auth, this.proxy_service.getAllProxies.bind(this.proxy_service));
    this.app.route('/proxies').get(auth, this.proxy_service.listProxies.bind(this.proxy_service));
    this.app.route('/update_proxies').post(auth, this.proxy_service.updateAllProxies.bind(this.proxy_service));
    this.app.route('/reload_proxies').post(auth, this.proxy_service.reloadProxies.bind(this.proxy_service));
  }

  private queueRoutes() {
    this.app.route('/items').post(auth, this.queue_service.getAllQueueItems.bind(this.queue_service));
    this.app.route('/items/:id').get(auth, this.queue_service.getAllQueueItems.bind(this.queue_service));
    this.app.route('/heal_queue').post(auth, this.queue_service.healQueue.bind(this.queue_service));
    this.app.route('/enqueue').post(auth, this.queue_service.enqueue.bind(this.queue_service));
  }

  private statsRoutes() {
    this.app.route('/system').get(auth, this.stats_service.getCrawlingInfraInfo.bind(this.stats_service));
    this.app.route('/ips/:id').get(auth, this.stats_service.getUniqueIps.bind(this.stats_service));
    this.app.route('/stats').get(auth, this.stats_service.getTaskStats.bind(this.stats_service));
    this.app.route('/stats/:id').get(auth, this.stats_service.stat.bind(this.stats_service));
  }

  private infraRoutes() {
    this.app.route('/scheduler/logs').get(auth, this.infra_service.getSchedulerLogs.bind(this.infra_service));
  }

  private testRoutes() {
    // some testing apis
    this.app.route('/test/ip').get(TestService.ip);
    this.app.route('/test/headers')
      .get(TestService.headers)
      .post(TestService.headers);
    this.app.route('/test/fp').get(TestService.fingerprint);
  }

  public routes() {
    this.app.route('/worker_meta').post(auth, this.task_service.getAllWorkerMeta.bind(this.task_service));

    // operations on all tasks
    this.app.route('/tasks')
      .get(auth, this.task_service.getAllCrawlTasks.bind(this.task_service))
      .put(auth, this.task_service.updateTasks.bind(this.task_service));

    this.app.route('/machines').get(auth, this.task_service.getAllMachines.bind(this.task_service));
    this.app.route('/delete_machines').post(auth, this.task_service.deleteAllMachines.bind(this.task_service));

    this.app.route('/delete_all').post(auth, this.task_service.deleteAll.bind(this.task_service));

    // pauses all tasks, helpful when you want to update the master or mongodb
    this.app.route('/pause_tasks').post(auth, this.task_service.pauseTasks.bind(this.task_service));

    // resumes all tasks that are paused
    this.app.route('/resume_tasks').post(auth, this.task_service.resumeTasks.bind(this.task_service));

    // get s3 cloud locations for task results
    this.app.route('/storage/:id').get(auth, this.task_service.getTaskStorage.bind(this.task_service));

    // download task as tar file
    this.app.route('/download_task').post(auth, this.task_service.downloadTask.bind(this.task_service));

    // download sample of most recent results as compressed tar file
    this.app.route('/download_sample').get(auth, this.task_service.downloadSample.bind(this.task_service));

    // show task results in browser as json
    this.app.route('/results/:id').get(auth, this.task_service.showTaskResults.bind(this.task_service));

    // create a new crawl task
    this.app.route('/task').post(auth, this.task_service.createCrawlTask.bind(this.task_service));

    // get items mapping
    this.app.route('/mapping/:id').get(auth, this.task_service.getMapping.bind(this.task_service));

    // invoke backend directly without queue and scheduler interference
    this.app.route('/crawl').post(api_key_given, this.api_service.crawl.bind(this.api_service));

    this.app
      .route("/task/:id")
      .get(auth, this.task_service.getTask.bind(this.task_service))
      .delete(auth, this.task_service.deleteCrawlTask.bind(this.task_service))
      .put(auth, this.task_service.updateCrawlTask.bind(this.task_service));

    this.app
      .route("/config/")
      .post(auth, this.task_service.createConfig.bind(this.task_service))
      .get(auth, this.task_service.getConfig.bind(this.task_service))
      .put(auth, this.task_service.updateConfig.bind(this.task_service));
  }
}
