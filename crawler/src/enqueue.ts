import {QueueItemStatus} from "@lib/types/queue";
import {HttpWorkerConfig, BrowserWorkerConfig} from './config';
import mongoose from "mongoose";
import {Logger, getLogger} from '@lib/misc/logger';

export class EnqueueHandler {
  logger: Logger;
  task_schema: mongoose.Schema;
  queue_schema: mongoose.Schema;
  config: HttpWorkerConfig | BrowserWorkerConfig;
  options: any;

  constructor(config: HttpWorkerConfig | BrowserWorkerConfig, options: any = {}) {
    this.logger = getLogger(null, 'enqueue', config.loglevel);
    this.config = config;
    this.options = options;
    this.task_schema = new mongoose.Schema({
      queue: String,
      worker_meta: String,
    });

    this.queue_schema = new mongoose.Schema({
      item: String,
      crawled: Date,
      status: {
        type: QueueItemStatus
      },
      retries: Number,
      error: String,
      region: String,
    });
  }

  /**
   * Obtain the name of the queue collection where we want to insert our items.
   *
   * @param task_id
   */
  public async getQueueName(task_id: string | null): Promise<string | null> {
    // if no task_id is provided, enqueue items in own task.
    if (task_id === '' || task_id === null || task_id === undefined) {
      this.logger.verbose(`Inserting items into own queue...`);
      return 'item_queue_' + this.config.task_id;
    }

    let Db = mongoose.connection.useDb('CrawlMaster');
    let task_model: any = Db.model("CrawlTask", this.task_schema);

    try {
      let task = await task_model.findById(task_id);
      if (task === null) {
        this.logger.warn(`No crawl task with id ${task_id}`);
      } else {
        this.logger.verbose(`Got task with queue ${task.queue}`);
        return task.queue;
      }
    } catch (err) {
      this.logger.error(`could not get task: ${err.toString()}`);
    }

    return null;
  }

  /**
   * Enqueue a bunch of items into itself or the queue of another task.
   *
   * @param task_id
   * @param items
   * @return whether enqueueing was successful
   */
  public async enqueueItems(task_id: string | null, items: Array<string>): Promise<boolean> {
    let queue_name = await this.getQueueName(task_id);

    try {
      if (queue_name) {
        return await this.insertItems(queue_name, items);
      }
    } catch(err) {
      this.logger.error(`could not insert items into queue ${queue_name}: ${err.toString()}`);
    }

    return false;
  }

  /**
   * Insert a bunch of items into the queue.
   *
   * @param queue_name
   * @param items
   */
  public async insertItems(queue_name: string, items: Array<string>): Promise<boolean> {
    let to_insert = [];
    let Db = mongoose.connection.useDb('CrawlMasterQueue');
    let queue_model: any = Db.model(queue_name, this.queue_schema);

    for (let item of items) {
      if (item) {
        to_insert.push({
          item: item,
          crawled: null,
          retries: 0,
          status: QueueItemStatus.initial,
        });
      }
    }

    // http://mongodb.github.io/node-mongodb-native/2.2/api/Collection.html#insertMany
    let insert_info = await queue_model.insertMany(to_insert, {
      ordered: false,
      bypassDocumentValidation: true,
    });

    this.logger.verbose(`Num items inserted into queue: ${insert_info.length}`);

    return insert_info.length === items.length;
  }
}