import mongoose from 'mongoose';
import {ICrawlTask} from "./crawltask.model";
import {IQueue, CrawlTaskQueueSchema, QueueItemStatus, IQueueStats} from "@lib/types/queue";

export class QueueHandler {
  queue_model: any;
  queue_name: string;

  constructor(queue_name: string) {
    this.queue_name = queue_name;
    try {
      const Db = mongoose.connection.useDb('CrawlMasterQueue');
      this.queue_model = Db.model<IQueue>(this.queue_name, CrawlTaskQueueSchema);
    } catch (err) {
      console.error('Critical Error in establishing queue connection: ' + err.toString());
      process.exit(1);
    }
  }

  /**
   * Drop the queue and all items.
   */
  public async dropQueue() {
    await this.queue_model.collection.drop();
  }

  /**
   * Insert items into queue.
   *
   * https://stackoverflow.com/questions/10519432/how-to-do-raw-mongodb-operations-in-mongoose/40833858
   */
  public async insertItems(items: Array<string>, use_native_driver: boolean = false): Promise<number> {
    let to_insert = [];
    let num_inserted = 0;
    console.time('insert_items');

    for (let item of items) {
      if (item) {
        to_insert.push({
          item: item,
          crawled: null,
          retries: 0,
          status: QueueItemStatus.initial,
          // error: '',
          // region: '',
        });
      }
    }

    let insert_info = null;

    if (use_native_driver) {
      insert_info = await mongoose.connection.db.collection(this.queue_name).insert(to_insert);
    } else {
      // http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#insertMany
      insert_info = await this.queue_model.insertMany(to_insert, {
        ordered: false,
        bypassDocumentValidation: true,
      });
    }

    num_inserted += (insert_info.nInserted || items.length);

    console.timeEnd('insert_items');
    console.log(`Inserted ${num_inserted} items`);

    return num_inserted;
  }

  public async updateItems(items: Array<string>, update) {
    try {
      let update_operations = [];
      for (let item_id of items) {
        update_operations.push({
          updateOne: {
            filter: {_id: new mongoose.Types.ObjectId(item_id)},
            update: update,
            upsert: false
          }
        });
      }

      let bulk_update_info = await this.queue_model.bulkWrite(update_operations);
      console.log(`Updated queue items: ${JSON.stringify(bulk_update_info)}`);
      return true;
    } catch (err) {
      console.error(err.toString());
      return false;
    }
  }

  /**
   * Get valuable metadata statistics about the queue items.
   *
   * What do we want?
   * - number of items with state initial, running, completed, failed
   */
  public async getQueueStatistics(task: ICrawlTask): Promise<IQueueStats> {
    let counts: IQueueStats =  {
      initial: await this.countQueueItems({'status': QueueItemStatus.initial}),
      running: await this.countQueueItems({'status': QueueItemStatus.running}),
      completed: await this.countQueueItems({'status': QueueItemStatus.completed}),
      failed: await this.countQueueItems({'status': QueueItemStatus.failed}),
    };
    return counts;
  }

  /**
   * Check if the task is finished.
   *
   * The task is finished when the number of completed plus the number
   * of definitely failed items equals the total number of queue items.
   *
   * @param task
   */
  public async taskFinished(task: ICrawlTask) {
    let num_def_failed: number = await this.queue_model.countDocuments({
      'status': QueueItemStatus.failed,
      'retries': { '$gte': task.retry_failed_items },
    });

    let num_completed: number = await this.queue_model.countDocuments({
      'status': QueueItemStatus.completed,
    });

    return num_def_failed + num_completed >= task.num_items;
  }

  /**
   * Very lean version, only gets most crucial data.
   *
   * model.find({query}).select({projection}).lean().count()
   *
   * https://docs.mongodb.com/manual/reference/method/db.collection.count/
   *
   * use an index on the status property
   *
   * @param task
   */
  public async getQueueStatisticsLean(task: ICrawlTask): Promise<any> {
    // https://stackoverflow.com/questions/56306235/mongoose-model-find-select-if-select-is-an-empty-string-whats-returned

    let completed = await this.countQueueItems({
      'status': QueueItemStatus.completed
    }, true);

    let failed = await this.countQueueItems({
      'status': QueueItemStatus.failed
    }, true);

    let running = await this.countQueueItems({
      'status': QueueItemStatus.running
    }, true);

    let initial = await this.countQueueItems({
      'status': QueueItemStatus.initial
    }, true);

    return {
      initial: initial,
      running: running,
      completed: completed,
      failed: failed,
    };
  }

  /**
   * Get quantity of completed items in last couple of hours.
   *
   * @param task
   */
  public async getTaskProgress(task: ICrawlTask) {
    if (task.num_items >= 2000000) {
      return {
        "60min": await this.completedItemsNewerThan(60),
        "12h": await this.completedItemsNewerThan(60 * 12),
      };
    } else {
      return {
        "10min": await this.completedItemsNewerThan(10),
        "90min": await this.completedItemsNewerThan(90),
        "12h": await this.completedItemsNewerThan(60 * 12),
      };
    }
  }

  public async completedItemsNewerThan(minutes: number) {
    if (minutes <= 0) {
      return 0;
    }

    let ms = minutes * 60 * 1000;
    let timestamp = new Date(Date.now() - ms);

    return await this.queue_model.find({
      status: QueueItemStatus.completed,
      crawled: { $gt: timestamp }
    }).select().lean().count();
  }

  public async getRecentCompleted(limit: number) {
    return await this.queue_model.find({
      status: QueueItemStatus.completed,
      crawled: { $ne: null },
      //error: '',
    }).sort('-crawled').limit(limit).lean();
  }

  public async countQueueItems(criteria: any, lean: boolean = false) {
    if (lean) {
      return await this.queue_model.find(criteria).lean().count();
    } else {
      return await this.queue_model.countDocuments(criteria);
    }
  }

  public async getQueueItems(filter: any, select: string = '') {
    return await this.queue_model.find(filter, select).lean();
  }

  /**
   * @return return the number of items that are currently running
   */
  public async getNumRunningItems() {
    return await this.queue_model.countDocuments({
      'crawled': null,
      'status': QueueItemStatus.running
    });
  }

  /**
   * @return return the number of items that failed for a reason that
   * should not be handled
   */
  public async getNumFailedItems() {
    return await this.queue_model.countDocuments({
      'crawled': null,
      'status': QueueItemStatus.failed
    });
  }

  /**
   * Reset all queue_handler items from "QueueItemStatus.running" -> "QueueItemStatus.initial"
   */
  public async resetQueueItems() {
    return await this.queue_model.updateMany(
      { 'status': QueueItemStatus.running },
      { 'status': QueueItemStatus.initial }
    );
  }

  /**
   * Enqueue failed items back when retries is below task.retry_failed_items
   * Set state back from `failed` to `initial`
   *
   * @param task
   */
  public async enqueueFailedItems(task: ICrawlTask) {
    return await this.queue_model.updateMany(
      {
        'status': QueueItemStatus.failed,
        'retries': { '$lt': task.retry_failed_items },
      },
      { 'status': QueueItemStatus.initial }
    );
  }

  /**
   * Enqueue failed items back to state `initial` regardless of number of
   * retries.
   *
   * this also resets all meta information such as `retries`, `error`
   */
  public async enqueueAllFailedItems() {
    return await this.queue_model.updateMany(
      {
        'status': QueueItemStatus.failed,
      },
      {
        'status': QueueItemStatus.initial,
        'crawled': null,
        'retries': 0,
        'error': '',
        'region': '',
      }
    );
  }

  /**
   * When the crawlers gets all fucked up, it might happen
   * that the queue items are lost in state running.
   *
   * this also resets all meta information such as `retries`, `error`
   */
  public async resetRunningItems() {
    return await this.queue_model.updateMany(
      {
        'status': QueueItemStatus.running,
      },
      {
        'status': QueueItemStatus.initial,
        'crawled': null,
        'retries': 0,
        'error': '',
        'region': '',
      }
    );
  }

}
