import {getLogger, Logger} from '@lib/misc/logger';
import {Request, Response} from "express";
import {QueueHandler} from "../models/queue.model";
import {WorkerMetaHandler} from "../models/workermeta.model";
import {average} from "@lib/misc/stats";
import {getTaskById} from "./helpers";
import {ConfigHandler} from "../models/config";
import {timeFormat} from "@lib/misc/helpers";
import {__VERSION__} from '../../scheduler/daemon';
import {version} from '../../package.json';
import {MachineHandler, MachineType} from "../models/machine.model";
import {TaskHandler} from "../models/crawltask.model";

export class StatsService {
  logger: Logger;
  task_handler: TaskHandler;

  constructor() {
    this.logger = getLogger(null, 'stats_service');
    this.task_handler = new TaskHandler();
  }

  /**
   * Get crawling infra system wide information. Helpful in order to obtain runtime info.
   */
  public async getCrawlingInfraInfo(req: Request, res: Response) {
    let machine_handler = new MachineHandler();
    let config_handler = new ConfigHandler();
    let now = new Date();
    let config = await config_handler.getConfig();
    let uptime: any = '';
    if (config.scheduler_started) {
      let elapsed_ms = now.valueOf() - config.scheduler_started.valueOf();
      uptime = timeFormat(elapsed_ms);
    }

    let system_info = {
      scheduler_uptime: uptime,
      scheduler_version: __VERSION__,
      api_version: version,
      machines_allocated: await machine_handler.getNumRunningMachines(),
      http_machines_allocated: await machine_handler.getNumRunningMachines(MachineType.http),
      num_total_items: await this.task_handler.getTotalItems(),
      num_tasks: await this.task_handler.getTotalTasks(),
    };

    res.json(system_info);
  }

  /**
   * Obtain task statistics information such as number of failed items
   * or progress information that helps to debug a task.
   *
   * @param req
   * @param res
   */
  public async stat(req: Request, res: Response) {
    let task = await getTaskById(req, res, this.task_handler);
    let queue = new QueueHandler(task.queue);
    let meta_handler = new WorkerMetaHandler(task.worker_meta);
    let avg = average(task.avg_items_per_second_worker);

    res.json({
      id: task._id,
      created_at: task.createdAt,
      status: task.status,
      avg_items_per_second: `${avg.toFixed(2)} average items per second in ${task.avg_items_per_second_worker.length} calls.`,
      worker_meta_statistics: await meta_handler.getWorkerMetaStatistics(),
      queue_statistics: await queue.getQueueStatistics(task),
      progress: await queue.getTaskProgress(task),
    });
  }

  /**
   * Provide a short and informative task summary.
   *
   * @param req
   * @param res
   */
  public async getTaskStats(req: Request, res: Response) {
    let progress: boolean = false;
    if (req.query.progress) {
      progress = true;
    }

    let filter: any = req.params.id ? {_id: req.params.id} : {};
    let task_handler = new TaskHandler();
    let tasks = await task_handler.task_model.find(filter);

    let summary = [];

    for (let task of tasks) {
      let queue = new QueueHandler(task.queue);
      let meta_handler = new WorkerMetaHandler(task.worker_meta);

      let avg = average(task.avg_items_per_second_worker);

      let info: any = {
        id: task._id,
        created_at: task.createdAt,
        status: task.status,
        longliving: task.longliving,
        num_items: task.num_items,
        max_items_per_second: task.max_items_per_second,
        max_items_per_worker: task.max_items_per_worker,
        avg_items_per_second: `${avg.toFixed(2)} average items per second in ${task.avg_items_per_second_worker.length} calls.`,
        num_crawl_workers_started: task.num_crawl_workers_started,
        num_workers_running: task.num_workers_running,
        num_lost_workers: task.num_lost_workers,
        worker_meta_statistics: await meta_handler.getWorkerMetaStatistics(),
        queue_statistics: null,
      };

      if (progress) {
        info.queue_statistics = await queue.getQueueStatistics(task);
        info.progress = await queue.getTaskProgress(task);
      } else {
        info.queue_statistics = await queue.getQueueStatisticsLean(task);
      }

      summary.push(info);
    }

    res.json(summary);
  }


  /**
   * Get a set of all unique ip addresses used in last n minutes.
   * @param minutes
   */
  public async getUniqueIps(req: Request, res: Response) {
    let task = await getTaskById(req, res);
    if (!task) {
      return;
    }

    let min: number = 60;
    if (req.query.min) {
      min = Number(req.query.min.toString());
    }

    let worker_meta_handler = new WorkerMetaHandler(task.worker_meta);

    worker_meta_handler.getIps(min).then((docs) => {
      let set = new Set();
      for (let doc of docs) {
        if (doc.ip) {
          set.add(doc.ip);
        }
      }
      let unique = [...set];
      res.json(unique);
    }).catch((err) => {
      res.status(400).send({error: err.toString()});
    });
  }

}