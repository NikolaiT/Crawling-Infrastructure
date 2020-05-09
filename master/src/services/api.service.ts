import {Logger, getLogger} from '@lib/misc/logger';
import {Request, Response} from "express";
import {CrawlRunner} from "../../scheduler/runner";
import {CrawlStatus, TaskHandler, WorkerType} from "../models/crawltask.model";
import {checkItems, profileAllowed, loadFunctionCode, configureCrawlProfile, assignRegions} from "./lib";
import {Config} from "../../scheduler/config";
import {ConfigHandler} from "../models/config";
const got = require('got');

export class ApiService {
  private config: Config | null;
  private task_handler: TaskHandler;
  logger: Logger;

  constructor() {
    this.config = null;
    this.logger = getLogger(null, 'api_service');
    this.task_handler = new TaskHandler();
  }

  public async setup() {
    try {
      let config_handler = new ConfigHandler();
      this.config = await config_handler.getConfig();
    } catch(err) {
      this.logger.error(`Cannot get config: ${err}`);
    }
  }

  /**
   * Request the external authentication service.
   */
  private async api_call(url: string, payload: any) {
    let options: any = {
      timeout: 7000,
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
      responseType: 'json'
    };

    try {
      let response = await got.post(url, options);
      let body = JSON.parse(response.body);
      if (body.status === 200 && body.message === 'ok') {
        return true;
      } else {
        return body;
      }
    } catch (err) {
      this.logger.error(err.toString());
      return false;
    }
  }

  private async check_api_call(obj: any): Promise<any> {
    if (!(obj.function || obj.function_code)) {
      return {error: `either function or function_code is required`};
    }

    if (obj.items) {
      let items_err = await checkItems(this.logger, obj.items);
      if (items_err) {
        return items_err;
      }
    }

    let priority = obj.priority || 1;

    if (priority < 1 || priority > 10) {
      return {error: 'key `priority` must be between 1 and 10.'};
    }

    if (obj.profile) {
      let err = await profileAllowed(this.logger, obj.profile);
      if (err) {
        return err;
      }
    }

    // populate crawl task object
    let crawl_task: any = {
      worker_id: 0,
      priority: priority,
      status: obj.status || CrawlStatus.started,
      function: obj.function,
      whitelisted_proxies: obj.whitelisted_proxies || false,
      crawl_options: obj.crawl_options || {
        default_navigation_timeout: 30000,
        request_timeout: 10000,
      },
      options: obj.options || {},
      num_items_crawled: 0,
      regions: [],
    };

    if (Array.isArray(obj.items)) {
      crawl_task.num_items = obj.items.length;
    }

    let function_code = obj.function_code || '';

    if (!function_code && obj.function) {
      try {
        function_code = await loadFunctionCode(this.logger, obj.function);
        let max_function_code_size: number = this.config.max_function_code_size || 25000;
        if (typeof function_code === 'string' && function_code.length > max_function_code_size) {
          return {error: `Function code is too large with size of ${function_code.length} bytes`};
        }
      } catch (e) {
        this.logger.error(e.toString());
      }
    }

    if (!function_code) {
      return { error: 'Error loading function code' };
    }

    crawl_task.function_code = function_code;

    if (crawl_task.function_code.includes('extends HttpWorker')) {
      crawl_task.worker_type = WorkerType.http;
    } else {
      crawl_task.worker_type = WorkerType.browser;
    }

    // assign the crawl profile
    await configureCrawlProfile(this.logger, obj.profile, crawl_task);

    // assign regions
    await assignRegions(this.config, obj, crawl_task);

    return crawl_task;
  }


  public async crawl(req: Request, res: Response): Promise<any> {
    let api_key: string = res.locals.api_key;

    let maybe_task: any = await this.check_api_call(req.body);
    if (maybe_task && maybe_task.error && typeof maybe_task.error === 'string') {
      return res.status(400).send(maybe_task);
    }

    if (maybe_task) {
      let issuer = req.body.email || 'unknown';
      this.logger.info(`[${issuer}] Received crawl task over ${req.body.items.length} items.`);
      // we created a valid crawl task, lets start working on them with our backends.
      let crawl_runner = new CrawlRunner(this.config);

      maybe_task.id = 'phoenix';
      if (req.body.streaming) {
        issuer = 'streaming-client';
        let authenticated = await this.api_call(process.env.EXTERNAL_AUTH_URL, req.body);
        if (authenticated === true) {
          this.logger.info(`[${issuer}] Authenticated streaming Api call.`);
          let results = await crawl_runner.runAwsLambdaConcurrent(res, maybe_task, req.body);
          // bill the api call and results
          let response = await this.api_call(process.env.EXTERNAL_BILL_URL, {
            user_api_key: api_key,
            results: results,
          });
          if (response === true) {
            this.logger.info(`[${issuer}] Billed streaming Api call.`);
          } else {
            this.logger.warn(`[${issuer}] Could not bill streaming Api call: ${response}`);
          }
        } else {
          return res.status(400).send({
            error: authenticated,
          });
        }
      } else {
        let results = await crawl_runner.runAwsLambdaConcurrent(res, maybe_task, req.body);
        return res.send(results);
      }

    } else {
      return res.status(400).send(maybe_task);
    }
  }

}