import 'module-alias/register';
import {ICrawlTask, WorkerType, crawl_options_keys} from "../src/models/crawltask.model";
import {WorkerStatus} from "@lib/types/workermeta";
import {Config} from "./config";
import {getLogger, Logger} from "@lib/misc/logger";
import https from "https";
import * as AWS from "aws-sdk";
import {IWorkerMetaHandler, WorkerMetaHandler} from "../src/models/workermeta.model";
import {HTTPError, RequestError} from 'got';
import {average} from "@lib/misc/stats";
import {IQueueStats} from "@lib/types/queue";
import {ExecutionEnv, ResultPolicy} from '@lib/types/common';
import {LogLevel} from '@lib/misc/logger';
import {Response} from "express";
const got = require('got');

export class CrawlRunner {
  task?: ICrawlTask;
  config: Config;
  logger: Logger;
  lambda: any;
  worker_meta_handler?: IWorkerMetaHandler;
  qstats?: IQueueStats;

  constructor(config: Config, task?: ICrawlTask, qstats?: IQueueStats, loglevel: LogLevel = LogLevel.info) {
    this.qstats = qstats;
    this.task = task;
    this.config = config;
    this.logger = getLogger(config.logging_root, 'runner', loglevel);
    this.setupAWS();
    this.setupLambdaClient(process.env.AWS_REGION);
    if (this.task) {
      this.worker_meta_handler = new WorkerMetaHandler(this.task.worker_meta);
    }
  }

  /**
   *
   * @param task
   * @param num_workers_to_launch
   * @return returns the number of successful lambda invocations
   */
  public async runAwsLambda(num_workers_to_launch: number): Promise<number> {
    let num_workers_started: number = 0;

    let function_arn: string = (this.task.worker_type === WorkerType.browser) ?
      this.config.browser_lambda_arn : this.config.http_lambda_arn;

    let worker_meta_to_remove: Array<any> = [];

    this.logger.verbose(`[${this.task._id}] Launching ${num_workers_to_launch} lambda crawlers`);

    for (let k = 0; k < num_workers_to_launch; k++) {
      // switch region for every new aws lambda instance
      let worker_payload: any = this.getPayload();
      worker_payload.compress = true;
      worker_payload.result_policy = ResultPolicy.store_in_cloud;
      worker_payload.execution_env = ExecutionEnv.lambda;

      let region = worker_payload.aws_config.AWS_REGION;
      // switch region for every new aws lambda instance
      let lambda_function = function_arn.replace('{region}', region);
      // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-region.html
      this.setupLambdaClient(region);

      worker_payload.worker_id = this.task.worker_id;

      let worker_meta: any = await this.worker_meta_handler.create({
        worker_id: this.task.worker_id,
        started: new Date(),
        region: region,
        status: WorkerStatus.started,
      });

      const invocation_params: any = {
        FunctionName: lambda_function,
        InvocationType: "Event",
        Payload: JSON.stringify(worker_payload),
      };

      this.logger.debug(`[${this.task._id}] ${JSON.stringify(worker_payload, null, 2)}`);
      this.logger.verbose(`[${this.task._id}] Launching lambda crawler in region ${region}`);
      this.logger.verbose(`[${this.task._id}] Worker_payload has size ${invocation_params.Payload.length} bytes`);

      try {
        const response = await this.invokeLambda(invocation_params, false);
        // https://docs.aws.amazon.com/de_de/lambda/latest/dg/API_Invoke.html
        // The HTTP status code is in the 200 range for a successful request.
        // For the RequestResponse invocation type, this status code is 200.
        // For the Event invocation type, this status code is 202.
        // For the DryRun invocation type, the status code is 204.
        if (response.StatusCode === 202 || response.StatusCode === 200) {
          num_workers_started++;
        } else {
          this.logger.error(`[${this.task._id}] Lambda invocation error with worker=${this.task.worker_id}: ${response.StatusCode}`);
          worker_meta_to_remove.push(worker_meta);
        }
      } catch (err) {
        this.logger.error(`[${this.task._id}] Error: ${err.toString()}`);
        worker_meta_to_remove.push(worker_meta);
      }

      // ensure that worker ids are unique
      // they are always incrementing
      this.task.worker_id++;
    }

    this.logger.info(`[${this.task._id}] Started ${num_workers_started} lambda crawlers successfully.`);

    await this.removeWorkerMeta(worker_meta_to_remove, true);
    return num_workers_started;
  }

  /**
   * Find an ideal number of items per worker for direct api invocations.
   */
  private getItemsPerWorker(num_items: number, concurrency: number | undefined): number {
    let items_per_worker: number = 0;
    // with only few items, dampen the concurrency a bit
    let increment_few_items: number = 1;

    let max_concurrency = this.config.api_max_concurrency;
    if (concurrency) {
      max_concurrency = Math.min(concurrency, max_concurrency);
      // do not reduce concurrency when user specifies it
      increment_few_items = 0;
    }

    if (num_items <= 15) {
      items_per_worker = 1;
    } else if (num_items > 15 && num_items <= 100) {
      items_per_worker = Math.ceil(num_items / max_concurrency) + increment_few_items;
    } else {
      items_per_worker = Math.ceil(num_items / max_concurrency);
    }

    return items_per_worker;
  }

  /**
   * Run the items as quickly as possible on the AWS Lambda backend.
   *
   * We allow config.api_max_concurrency concurrent lambda functions
   * and distribute our items on them.
   *
   * When should we switch to a new region?
   *
   * Just switch region for every invoke by default. This
   * provides maximal randomization.
   *
   * @param task: the created task
   * @param res: the response
   * @param body: the request json payload
   */
  public async runAwsLambdaConcurrent(res: Response, task: any, body: any): Promise<any> {
    let items: Array<string> = body.items;
    let concurrency: number = body.concurrency || 0;
    let streaming: boolean = body.streaming || false;

    let function_arn: string = (task.worker_type === WorkerType.browser) ?
      this.config.browser_lambda_arn : this.config.http_lambda_arn;

    // switch region for every new aws lambda instance
    let worker_payload: any = this.taskToWorkerPayload(task);

    worker_payload.compress = false;
    worker_payload.result_policy = ResultPolicy.return;
    worker_payload.execution_env = ExecutionEnv.lambda;

    let items_per_worker: number = this.getItemsPerWorker(items.length, concurrency);
    let invocations: Array<any> = [];
    let region_calls: any = {};
    let started = (new Date()).valueOf();

    while (items.length > 0) {
      let items_for_worker: Array<string> = items.splice(0, items_per_worker);

      if (items_for_worker.length <= 0) {
        break;
      }

      let region = this.getRandomRegion(task.regions);
      // switch region for every new aws lambda instance
      let lambda_function = function_arn.replace('{region}', region.region);
      // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-region.html
      this.setupLambdaClient(region.region);

      task.worker_id++;
      worker_payload.worker_id = task.worker_id;
      worker_payload.items = items_for_worker;
      let invocation_params = {
        FunctionName: lambda_function,
        InvocationType: "RequestResponse",
        Payload: JSON.stringify(worker_payload),
      };
      this.logger.debug(JSON.stringify(worker_payload, null, 1));
      let logger = this.logger;
      if (streaming) {
        invocations.push(this.invokeLambda(invocation_params, true).then((result) => {
          const {response} = result;
          if (streaming && response.StatusCode === 202 || response.StatusCode === 200) {
            let elapsed = (new Date()).valueOf() - started;
            logger.info(`[Streaming] Writing ${response.Payload.length} bytes after ${elapsed}ms`);
            // @todo: why do we need to parse and stringify here? Encoding issues?
            res.write(JSON.stringify(JSON.parse(response.Payload)));
          }
          return result;
        }));
      } else {
        invocations.push(this.invokeLambda(invocation_params, true));
      }

      if (Object.keys(region_calls).includes(region.region)) {
        region_calls[region.region]++;
      } else {
        region_calls[region.region] = 1;
      }
    }

    let responses: Array<any> = [];
    let results: Array<any> = [];
    this.logger.info(`[${task.id}] Invocation stats from ${Object.keys(region_calls).length} regions: ${JSON.stringify(region_calls, null, 2)}`);

    try {
      responses = await Promise.all(invocations);
      this.logger.info(`[${task.id}] Received ${responses.length} responses with ${items_per_worker} items per worker`);
    } catch (err) {
      this.logger.error(`[${task.id}] Error: ${err.toString()}`);
      return {error: err.toString()};
    }

    if (streaming) {
      let elapsed = (new Date()).valueOf() - started;
      this.logger.info(`[Streaming] Ending after ${elapsed}ms`);
      res.end();
    }

    let blocking_end = (new Date()).valueOf();
    console.time('parse_responses');
    let elapsed_times = [];
    for (let obj of responses) {
      try {
        const {response, started, elapsed} = obj;
        elapsed_times.push({
          elapsed_until_blocking_end: blocking_end - started,
          elapsed_invokeLambda: elapsed
        });
        if (response.StatusCode === 202 || response.StatusCode === 200) {
          let result;
          try {
            result = JSON.parse(response.Payload);
            results.push(result);
          } catch (err) {
            this.logger.error(`Cannot add results: ${err}`);
            this.logger.error(`${JSON.stringify(result)}`);
          }
        } else {
          this.logger.error(`[${task.id}] Lambda invocation error: ${response}`);
        }
      } catch (err) {
        this.logger.error(err.toString());
      }
    }

    elapsed_times.sort((a: any, b: any) => a.elapsed_invokeLambda - b.elapsed_invokeLambda);

    if (!streaming) {
      this.logger.info(`[${task.id}] Invocation elapsed times: ${JSON.stringify(elapsed_times, null, 2)}`);
    }
    console.timeEnd('parse_responses');
    return results;
  }


  /**
   * Pick a random region from the regions that
   * are available to the task.
   */
  private getRandomRegion(available_regions: any[] = []) {
    let regions: Array<any> = [];

    if (Array.isArray(available_regions) && available_regions.length > 0) {
      regions = available_regions;
    } else {
      regions = this.config.regions;
    }

    return regions[Math.floor(Math.random() * regions.length)];
  }

  /**
   * Compute the number of items a single worker instance
   * can crawl based on the past average requests per second.
   *
   * If there are less than 10 average request measurements, just
   * give a low conservative value.
   *
   * Let's assume a lambda task has a total of 5 minutes of time and needs
   * 45 seconds for mgmt and db operations. So it has 255s of crawling time.
   */
  private getNumItems(): number {
    let num_items: number = (this.task.worker_type === WorkerType.browser ? this.config.num_items_browser : this.config.num_items_http);

    if (this.task.avg_items_per_second_worker.length >= 7) {
      let avg_rps = average(this.task.avg_items_per_second_worker);

      if (avg_rps <= 0) {
        avg_rps = (this.task.worker_type === WorkerType.browser ? 0.2 : 0.5);
      }

      // we have average requests per second, but we want the number
      // of seconds that a requests takes
      let seconds_per_item = 1 / avg_rps;
      let max_crawling_time: number = this.config.max_crawling_time_lambda || 240;
      num_items = Math.floor(max_crawling_time / seconds_per_item);
    }

    // set some hard limits
    if (this.task.whitelisted_proxies) {
      num_items = (this.task.worker_type === WorkerType.browser ? 100 : 200);
    }

    if (this.task.max_items_per_worker) {
      num_items = Math.min(num_items, this.task.max_items_per_worker);
    }

    return num_items;
  }

  /**
   * Creates the worker payload from a crawl task.
   *
   * A crawl task can be a Mongoose Document or a plain object.
   *
   * https://alexanderzeitler.com/articles/mongoose-tojson-toobject-transform-with-subdocuments/
   *
   * @param task
   * @return populated worker_payload
   */
  private taskToWorkerPayload(task: any, create_from_model: boolean = false) {
    let region = this.getRandomRegion(task.regions);
    let worker_payload: any = {
      task_id: task.id,
      aws_config: {
        AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
        AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
        AWS_REGION: region.region,
        AWS_BUCKET: region.bucket,
      },
      loglevel: this.config.worker_loglevel,
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
    };

    for (let key of crawl_options_keys) {
      if (task.crawl_options[key]) {
        worker_payload[key] = task.crawl_options[key];
      }
    }

    if (create_from_model === false) {
      for (let key of Object.keys(task)) {
        if (key !== 'crawl_options' && !key.startsWith('_')) {
          worker_payload[key] = task[key];
        }
      }
    }

    return worker_payload;
  }

  /**
   * Create payload for the crawl worker.
   */
  private getPayload(execution_env = ExecutionEnv.lambda) {
    let worker_payload: any = this.taskToWorkerPayload(this.task, true);

    Object.assign(worker_payload, {
      worker_id: this.task.worker_id,
      function_code: this.task.function_code,
      storage_policy: this.task.storage_policy,
      num_items_worker: this.getNumItems(),
      compress: true,
      result_policy: ResultPolicy.store_in_cloud,
      execution_env: execution_env,
      log_ip_address: this.task.log_ip_address,
      options: this.task.options,
    });

    if (this.qstats) {
      let fail_ratio = this.qstats.failed / this.task.num_items;
      if (fail_ratio >= this.config.debug_info_threshold && this.task.worker_type === WorkerType.browser) {
        if (this.task.items_browser_debug.length <= this.config.max_debug_info) {
          this.logger.warn(`Num failed items is ${fail_ratio}, logging debug information in browser worker.`);
          worker_payload.store_browser_debug = true;
        }
      }
    }

    if (worker_payload.execution_env === ExecutionEnv.docker) {
      worker_payload.API_KEY = process.env.API_KEY;
      if (this.task.worker_type === WorkerType.browser) {
        worker_payload.worker_type = 'browser';
      } else {
        worker_payload.worker_type = 'http';
      }
    }

    return worker_payload;
  }

  /**
   * https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html
   * https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#invoke-property
   *
   * @param measure: whether to measure the execution time of the invocation
   * @param params
   */
  async invokeLambda(params: any, measure: boolean = false): Promise<any> {
    return new Promise((resolve, reject) => {
      const start = (new Date()).valueOf();
      this.lambda.invoke(params, (error: Error, response: any) => {
        if (error) {
          reject(error);
        } else {
          if (measure) {
            resolve({
              response,
              started: start,
              elapsed: (new Date()).valueOf() - start,
            });
          } else {
            resolve(response);
          }
        }
      });
    });
  }

  private setupLambdaClient(region: string) {
    var agent = new https.Agent({
      maxSockets: 300
    });

    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html
    // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/node-configuring-maxsockets.html
    this.lambda = new AWS.Lambda({
      region: region,
      // we do NOT want the lambda execution environment to retry tasks when they fail
      maxRetries: 0,
      // when taking invocation_type = 'request_response' we should
      // increase the timeouts to 300 seconds = 5 minutes
      httpOptions: {
        agent: agent,
        // 310 seconds ~ 5 minutes
        timeout: 310000,
        connectTimeout: 15000
      }
    });
  }

  private checkEnv() {
    let required_env_keys = ['AWS_ACCESS_KEY',
      'AWS_SECRET_KEY', 'AWS_REGION', 'MONGODB_CONNECTION_URL'];

    let abort = false;
    for (let key of required_env_keys) {
      if (!process.env[key]) {
        this.logger.error(`process.env key ${key} is missing.`);
        abort = true;
      }
    }
    if (abort) {
      this.logger.error(`Aborting due to missing environment.`);
      process.exit(0);
    }
  }

  private setupAWS() {
    this.checkEnv();
    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region: process.env.AWS_REGION
    });
  }

  /**
   * Run crawl payload on docker cluster.
   *
   * @param task
   * @param num_workers_to_launch
   * @return the number of workers started
   */
  public async runDocker(num_workers_to_launch: number, endpoints: Array<string>): Promise<number> {
    let num_workers_started = 0;

    if (endpoints.length <= 0) {
      return num_workers_started;
    }

    this.logger.verbose(`[${this.task._id}] Launching ${num_workers_to_launch} docker crawlers with endpoints: ${endpoints}`);

    let worker_payload: any = this.getPayload(ExecutionEnv.docker);
    let worker_meta_ids_to_remove = [];
    let options = {
      timeout: 10000,
      method: 'POST',
      body: worker_payload,
      retry: 0,
      json: true
    };

    for (let num = 0; num < num_workers_to_launch; num++) {
      if (endpoints.length <= 0) {
        break;
      }

      options.body.worker_id = this.task.worker_id;

      await this.worker_meta_handler.create({
        worker_id: this.task.worker_id,
        started: new Date(),
        region: worker_payload.aws_config.AWS_REGION,
        status: WorkerStatus.started,
      });

      // use each endpoint equally
      let endpoint_index = num % endpoints.length;
      let endpoint = endpoints[endpoint_index];
      let url = endpoint + '/invokeEvent';

      try {
        let response = await got(url, options);
        if (response.body && response.body.status === 200 && response.body.message.includes('successfully started')) {
          num_workers_started++;
        }
      } catch (Error) {
        // in any case of error, request error or http error, remove the worker meta
        worker_meta_ids_to_remove.push(this.task.worker_id);
        // remove the endpoint that caused the error
        endpoints.splice(endpoint_index, 1);

        if (Error instanceof RequestError) {
          this.logger.warn(`RequestError: ${Error}`);
        }

        if (Error instanceof HTTPError) {
          if (Error.response) {
            if (Error.response.body && Error.response.body.error.includes('Cannot process request')) {
              this.logger.verbose(`Endpoint ${url} error: ${Error.response.body.error}`);
            } else {
              this.logger.error(`Failure with crawler service: ${Error.toString()}`);
            }
          }
        }
      }

      // ensure that worker ids are unique
      // they are always incrementing
      this.task.worker_id++;
    }

    this.logger.info(`[${this.task._id}] Started ${num_workers_started} docker crawlers successfully.`);

    await this.removeWorkerMeta(worker_meta_ids_to_remove);

    return num_workers_started;
  }

  private async removeWorkerMeta(worker_meta_to_remove: Array<any>, by_object: boolean = false) {
    if (worker_meta_to_remove.length) {

      this.logger.verbose(`Removing ${worker_meta_to_remove.length} worker meta objects...`);

      if (by_object) {
        await this.worker_meta_handler.removeByObjects(worker_meta_to_remove);
      } else {
        await this.worker_meta_handler.removeByIds(worker_meta_to_remove);
      }
    }
  }
}