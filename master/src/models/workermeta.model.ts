import mongoose from 'mongoose';
import {ICrawlTask} from "./crawltask.model";
import {formatBytes, timeFormat} from '@lib/misc/helpers';
import {IWorkerMeta, WorkerMetaSchema, WorkerStatus} from "@lib/types/workermeta";

export interface IWorkerMetaHandler {
  worker_meta_model: any;

  dropWorkerMeta();
  getAll(filter: any);
  getIps(minutes: number);
  create(worker_meta: any);
  removeByIds(worker_ids: Array<number>);
  removeByObjects(worker_metas: Array<any>);
  getWorkerMetaStatistics(): Promise<any>;
  detectLostWorkers(task: ICrawlTask, worker_lost_threshold_minutes: number);
  healQueue(task: ICrawlTask, queue_handler: any, num_running: number);
  updateState(task: ICrawlTask): Promise<number>;
  cleanWorkerMeta(purge_worker_meta_after_minutes: number);
}

export class WorkerMetaHandler implements IWorkerMetaHandler {
  worker_meta_model: any;

  constructor(collection_name: string) {
    const Db = mongoose.connection.useDb('WorkerMeta');
    this.worker_meta_model = Db.model<IWorkerMeta>(collection_name, WorkerMetaSchema);
  }

  /**
   * Drop all worker meta data.
   */
  public async dropWorkerMeta() {
    await this.worker_meta_model.collection.drop();
  }

  public async getAll(filter: any = {}, sort: any = {}, limit: any = {}) {
    return await this.worker_meta_model.find(filter).sort(sort).limit(limit).lean();
  }

  public async getIps(minutes: number) {
    let ms = minutes * 60 * 1000;
    let timestamp = new Date(Date.now() - ms);

    return await this.worker_meta_model.find({
      status: WorkerStatus.completed,
      ended: {$ne: null, $gt: timestamp},
      ip: {$nin: [null, '']},
    }).sort('-ended').lean();
  }

  public async create(worker_meta: any) {
    return this.worker_meta_model.create(worker_meta);
  }

  public async removeByObjects(worker_metas: Array<any>) {
    for (let meta of worker_metas) {
      await meta.delete();
    }
  }

  public async removeByIds(worker_ids: Array<number>) {
    await this.worker_meta_model.deleteMany({ worker_id: { $in: worker_ids} });
  }

  /**
   * Get valuable metadata statistics about all the lambda workers launched.
   *
   * What do we want?
   *
   * - number of data points: N
   * - average number of failed items per worker
   * - average number of crawled items per worker
   * - average execution time of all workers
   * - percentage of lost workers
   * - number of total bytes stored in the cloud
   */
  public async getWorkerMetaStatistics(): Promise<any> {
    let all_metadata = await this.worker_meta_model.find({}).lean();

    let N = all_metadata.length;

    if (N <= 0) return {};

    let total_failed = 0;
    let total_crawled = 0;
    let total_lost = 0;
    let total_bytes = 0;
    let total_execution_time_ms = 0;

    for (let meta of all_metadata) {
      if (meta.bytes_uploaded) {
        total_bytes += meta.bytes_uploaded;
      }
      if (meta.status === WorkerStatus.lost) {
        total_lost++;
      }
      total_crawled += meta.num_items_crawled;
      total_failed += meta.num_items_failed;
      if (meta.started instanceof Date && meta.ended instanceof Date) {
        total_execution_time_ms += meta.ended.valueOf() - meta.started.valueOf();
      }
    }

    let lost_in_percent = (total_lost / N) * 100;
    let exec_time = timeFormat((total_execution_time_ms / N) / 1000);
    let avg_failed_items = (total_failed / N) || 0;

    return {
      N: N,
      'average number of failed items': avg_failed_items.toFixed(2),
      'average number of crawled items': (total_crawled / N).toFixed(2),
      'average execution time': exec_time,
      'lost workers in %': lost_in_percent.toFixed(2),
      'total bytes uploaded to cloud': formatBytes(total_bytes),
    }
  }

  /**
   * Iterate through all worker meta documents and see if
   * workers were lost.
   *
   * check if we have workers that are older than `worker_lost_threshold_minutes`
   */
  public async detectLostWorkers(task: ICrawlTask, worker_lost_threshold_minutes: number) {
    let workers_still_running = await this.worker_meta_model.find({
      status: WorkerStatus.started,
      ended: null,
      average_items_per_second: null,
    });

    let time_now = new Date();
    let threshold_ms = worker_lost_threshold_minutes * 60 * 1000;
    let num_lost_workers = 0;

    for (let meta of workers_still_running) {
      // since when have they been running?
      let elapsed = time_now.valueOf() - meta.started.valueOf();

      // worker is lost :(
      if (elapsed >= threshold_ms) {
        meta.status = WorkerStatus.lost;
        task.num_lost_workers++; // absolute counter
        num_lost_workers++;
        console.log(`[${task._id}] Detected lost worker! Non-responding since ${elapsed}ms. ${meta}`);

        if (task.num_workers_running > 0) {
          task.num_workers_running--; // the lost worker was also running, therefore decrease the state counter
        }

        await meta.save();
      }
    }

    await task.save();
  }

  /**
   * Set queue items from state `running` -> `initial` if
   *
   * - there are queue items in state `running` (base condition)
   * - the task has no workers currently running (This ensures that no running worker will be able to update queue items)
   * - the last worker that completed ended 6 minutes ago (This ensures that items won't be updated anymore by any worker).
   *
   * or
   *
   * - there are queue items in state `running` (base condition)
   * - the task has no workers currently running (This ensures that no running worker will be able to update queue items)
   * - there is at least one lost worker
   *
   * @param num_running num queue items in state `running`
   * @param task
   * @param queue_handler
   */
  public async healQueue(task: ICrawlTask, queue_handler: any, num_running: number) {
    let time_thresh = 6 * 60 * 1000; // ended 6 minutes ago
    let reset_items: boolean = false;

    if (num_running > 0 && task.num_workers_running === 0) {
      reset_items = task.num_lost_workers > 0;

      let results = await this.worker_meta_model.find({
        status: WorkerStatus.completed
      }).sort({ ended: -1 }).limit(1);

      if (results.length) {
        let last_worker_finished = results[0];
        let now = new Date();
        let time_diff = now.valueOf() - last_worker_finished.ended.valueOf();

        if (time_diff >= time_thresh) {
          console.log(`[${task._id}] Healing Queue. Last successful worker ended ${time_diff}ms ago.`);
          reset_items = true;
        }
      }
    }

    if (reset_items) {
      console.log(`[${task._id}] Healing from worker loss: Setting all queue items from "QueueItemStatus.running" -> "QueueItemStatus.initial"`);
      let update_info = await queue_handler.resetQueueItems();
      console.log(update_info);
    }
  }

  /**
   * Update task state by finding freshly completed worker meta mongo documents.
   */
  public async updateState(task: ICrawlTask): Promise<number> {
    let fresh_workers_finished = await this.worker_meta_model.find({
      status: WorkerStatus.started,
      ended: { $ne: null },
      average_items_per_second: { $ne: null },
    });

    if (fresh_workers_finished) {
      for (let finished of fresh_workers_finished) {
        finished.status = WorkerStatus.completed;
        await finished.save();
        if (task.num_workers_running > 0) {
          task.num_workers_running--; // the lost worker was also running, therefore decrease the state counter
        }
        task.num_items_crawled += finished.num_items_crawled; // add num items crawled to total counter
        task.avg_items_per_second_worker.push(finished.average_items_per_second);
        if (finished.items_browser_debug.length) {
          task.items_browser_debug = task.items_browser_debug.concat(finished.items_browser_debug);
        }
      }
      await task.save();
    }

    if (Array.isArray(fresh_workers_finished)) {
      return fresh_workers_finished.length;
    } else {
      return 0;
    }
  }

  /**
   * Delete all worker meta whose metadata was successfully processed
   * and is older than a certain threshold.
   */
  public async cleanWorkerMeta(purge_worker_meta_after_minutes: number) {
    let delete_threshold_ms = purge_worker_meta_after_minutes * 60 * 1000;
    let num_purged = 0;
    let time_now = new Date();

    let workers_finished = await this.worker_meta_model.find({
      status: WorkerStatus.completed,
      ended: { $ne: null },
      average_items_per_second: { $ne: null },
    });

    for (let meta of workers_finished) {
      let elapsed = time_now.valueOf() - meta.ended.valueOf();
      if (elapsed >= delete_threshold_ms) {
        console.log(`Deleting worker meta: ${meta}`);
        meta.remove();
        num_purged++;
      }
    }

    if (num_purged > 0) {
      console.log(`Purged ${num_purged} worker meta elements!`);
    }
  }
}
