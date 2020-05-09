import mongoose from 'mongoose';
import {BrowserWorkerConfig, HttpWorkerConfig} from './config';
import {getLogger, Logger} from '@lib/misc/logger';
import {CrawlTaskQueueSchema, Item, QueueItemStatus} from "@lib/types/queue";
import {WorkerMetaSchema} from "@lib/types/workermeta";
import {MetadataHandler} from './metadata';

export class MongoDB {
  config: HttpWorkerConfig | BrowserWorkerConfig;
  logger: Logger;
  public connected: boolean;

  constructor(config: HttpWorkerConfig | BrowserWorkerConfig) {
    this.config = config;
    this.logger = getLogger(null, 'mongodb');
    this.connected = false;
  }

  public disconnect() {
    if (this.connected) {
      try {
        mongoose.disconnect();
        this.connected = false;
      } catch (err) {
        this.logger.error(err.toString());
      }
    }
  }

  /*
   * Connect to mongodb on master.
   */
  public async connectToMongoServer() {
    try {
      mongoose.Promise = global.Promise;
      // https://mongoosejs.com/docs/connections.html#options
      // https://mongoosejs.com/docs/deprecations.html
      await mongoose.connect(this.config.mongodb_url, {
        // when set to false, MongoDB driver's findOneAndUpdate() function is used
        // this is what we want, not mongooses's findAndModify()
        useFindAndModify: false,
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
      });
      this.logger.verbose('Connected to mongodb server');
      this.connected = true;
    } catch (err) {
      this.connected = false;
      this.logger.warn(`Unable to connect to mongodb: ${err.toString()}`);
    }
  }
}

export class CrawlQueue {
  config: HttpWorkerConfig | BrowserWorkerConfig;
  queue_schema: mongoose.Schema;
  worker_meta_schema: mongoose.Schema;
  queue_model: any;
  worker_meta_model: any;
  logger: Logger;

  constructor(config: HttpWorkerConfig | BrowserWorkerConfig) {
    this.config = config;
    this.logger = getLogger(null, 'queue', config.loglevel);

    this.queue_schema = CrawlTaskQueueSchema;

    this.worker_meta_schema = WorkerMetaSchema;

    let queue_name = 'item_queue_' + this.config.task_id;
    let worker_meta_name = 'worker_meta_' + this.config.task_id;

    let Db = mongoose.connection.useDb('CrawlMasterQueue');
    this.queue_model = Db.model(queue_name, this.queue_schema);

    Db = mongoose.connection.useDb('WorkerMeta');
    this.worker_meta_model = Db.model(worker_meta_name, this.worker_meta_schema);
  }

  /**
   * This is probably slow because there are N calls to the database, but
   * the advantage is that findOneAndUpdate() is an atom write operation.
   *
   * https://docs.mongodb.com/manual/core/write-operations-atomicity/
   *
   * @param num_items
   */
  async getItemsToCrawlSafe(num_items: number): Promise<Array<Item>> {
    let items_to_crawl: Array<Item> = [];

    try {
      for (let i = 0; i < num_items; i++) {
        let item = await this.queue_model.findOneAndUpdate(
          { crawled: null, status: QueueItemStatus.initial },
          { $set: { status: QueueItemStatus.running } },
          {
            new: true,
            useFindAndModify: false,
          }
        );

        // if no item is returned, no more work is to be done.
        // we can make a siesta :)
        if (!item) {
          break;
        } else {
          items_to_crawl.push(item);
        }
      }
    } catch(err) {
      this.logger.error(`Could not obtain items from queue: ${err.toString()}`);
    }

    this.logger.info(`Got ${items_to_crawl.length} items from the queue to crawl.`);
    return items_to_crawl;
  }

  public async updateQueueNew(items: Array<any>) {
    try {
      let update_operations = [];

      // https://docs.mongodb.com/manual/reference/method/db.collection.updateOne/#db.collection.updateOne
      // https://masteringjs.io/tutorials/mongoose/upsert
      for (let item of items) {
        update_operations.push({
          updateOne: {
            filter: {_id: new mongoose.Types.ObjectId(item._id)},
            update: {
              crawled: item.crawled,
              retries: item.retries,
              status: item.status,
              error: item.error || '',
              // insert the region where the item was uploaded to
              region: this.config.aws_config.AWS_REGION || '',
            },
            upsert: false
          }
        });
      }

      let bulk_update_info = await this.queue_model.bulkWrite(update_operations);
      this.logger.info(`Updated queue items: ${JSON.stringify(bulk_update_info)}`);
      return true;
    } catch (err) {
      console.error(err.toString());
      return false;
    }
  }

  /**
   * Update worker metadata to communicate success back to the master server.
   *
   * @param meta
   */
  public async updateWorkerMetaNew(meta: MetadataHandler) {

    if (typeof this.config.worker_id !== 'number') {
      this.logger.verbose('worker_id not numeric, not attempting to update worker meta');
      return;
    }

    try {
      let update: any = {
        'ended': new Date(),
        'average_items_per_second': meta.avg_items_per_second,
        'num_items_crawled': meta.num_items_crawled,
        'num_items_failed': meta.num_items_failed,
        'bytes_uploaded': meta.bytes_uploaded,
        'worker_status': meta.worker_status,
      };

      if (this.config.store_browser_debug) {
        let failed_items = [];
        for (let item of meta.items) {
          if (item.status === QueueItemStatus.failed) {
            failed_items.push(item._id);
          }
        }
        update['items_browser_debug'] = failed_items;
      }

      if (this.config.public_ip) {
        update['ip'] = this.config.public_ip;
      }

      let update_info = await this.worker_meta_model.findOneAndUpdate(
        {'worker_id': this.config.worker_id},
        update, {
          new: true,
          useFindAndModify: false
        }
      ).exec();
      this.logger.info(`Updated worker meta: ${JSON.stringify(update_info)}`);
    } catch (err) {
      this.logger.error(`Could not update worker meta: ${err.toString()}`);
    }
  }
}