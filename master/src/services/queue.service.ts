import {Logger, getLogger} from '@lib/misc/logger';
import {Request, Response} from "express";
import {QueueHandler} from "../models/queue.model";
import {QueueItemStatus} from "@lib/types/queue";
import {CrawlStatus} from "../models/crawltask.model";
import {CrawlTaskService} from './crawltask.service';
import {walk} from "@lib/misc/helpers";
import {getTaskById} from './helpers';
import path from "path";
import fs from "fs";
import zlib from "zlib";

export class QueueService {
  logger: Logger;

  constructor() {
    this.logger = getLogger(null, 'queue_service');
  }

  private async getQueueHandler(req: Request, res: Response) {
    let task = await getTaskById(req, res);
    if (task) {
      return new QueueHandler(task.queue);
    } else {
      return null;
    }
  }

  public async getAllQueueItems(req: Request, res: Response) {
    let queue_handler = await this.getQueueHandler(req, res);
    if (!queue_handler) {
      return null;
    }

    let filter: any = {};
    let select: string = '';
    let limit: number | null = null;

    if (req.body) {
      filter = req.body.filter || {};
      select = req.body.select || '';
      limit = req.body.limit || null;
    }

    if (req.query.failed) {
      filter = {
        status: QueueItemStatus.failed
      }
    }

    queue_handler.queue_model
      .find(filter, select)
      .lean()
      .limit(limit).then((items) => {
        res.json(items);
      }).catch((err) => {
        res.status(400).send({error: err.toString()});
      });
  }

  /**
   * `running` -> Set the queue items from state running --> initial when the task is
   * paused.
   *
   * `failed` -> Set the queue items from state failed --> initial when the task is paused.
   *
   * @param req
   * @param res
   */
  public async healQueue(req: Request, res: Response) {
    let task = await getTaskById(req, res);
    if (!task) {
      return null;
    }

    let what = req.body.what;

    if (task.status === CrawlStatus.paused || task.status === CrawlStatus.completed) {
      let queue_handler = new QueueHandler(task.queue);
      if (what === 'running') {
        await queue_handler.resetRunningItems().then((onfullfilled) => {
          res.json(onfullfilled);
        }).catch((onerr) => {
          res.status(400).send({error: onerr.toString()});
        });
      } else if (what === 'failed') {
        await queue_handler.enqueueAllFailedItems().then((onfullfilled) => {
          res.json(onfullfilled);
        }).catch((onerr) => {
          res.status(400).send({error: onerr.toString()});
        });
      } else {
        res.status(400).send({error: 'what must be either `running` or `failed`'});
      }
    } else {
      res.status(400).send({error: 'task must be in state `paused` or `completed`'});
    }
  }

  /**
   * Enqueue items based on the outcome of a function.
   *
   * @param req
   * @param res
   */
  public async enqueue(req: Request, res: Response) {
    let task = await getTaskById(req, res);
    if (!task) {
      return null;
    }

    let dryrun: boolean = true;

    if (req.body.dryrun === 'false') {
      dryrun = false;
    }

    let items_to_enqueue = [];
    let all_items = [];
    let queue_hander = new QueueHandler(task.queue);

    // simply horrid from a security point
    if (req.body.function) {
      let check_function = null;
      try {
        check_function = eval('(' + req.body.function + ')');
      } catch (err) {
        return res.status(400).send({error: '`function` is an invalid function'});
      }

      // download results
      let download_location = await CrawlTaskService.downloadResults(task);

      // now find all files recursively
      // decompress them and add them to a data structure
      let files = await walk(download_location);
      let num_enqueued: number = 0;

      this.logger.info(`checking ${files.length} files`);

      for (const [i, path_to_file] of files.entries()) {
        try {
          let item_id = path.basename(path_to_file);
          let contents = fs.readFileSync(path_to_file);
          let inflated = zlib.inflateSync(contents).toString();

          if (check_function(item_id, inflated)) {
            items_to_enqueue.push(item_id);
            all_items.push(item_id);
          }

          // update in batches of 1000 or when we arrive at the last iteration
          if (items_to_enqueue.length >= 1000 || i === files.length - 1) {
            let success: boolean = false;
            if (!dryrun) {
              success = await queue_hander.updateItems(items_to_enqueue, {
                crawled: null,
                retries: 0,
                status: QueueItemStatus.initial,
                error: '',
              });
            }
            if (success || dryrun) {
              num_enqueued += items_to_enqueue.length;
            }
            items_to_enqueue = [];
          }

        } catch (err) {
          this.logger.error(err.toString());
        }
      }

      this.logger.info(`enqueued ${num_enqueued} items`);
      return res.json(all_items);

    } else {
      return res.status(400).send({error: '`function` is needed'});
    }
  }
}