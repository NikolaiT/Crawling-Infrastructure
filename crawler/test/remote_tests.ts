import 'module-alias/register';
require('dotenv').config({ path: 'env/testing.env' });
import { expect } from 'chai';
import 'mocha';
import {ExecutionEnv, ResultPolicy} from '@lib/types/common';
import {
  turnDown,
  endpoint,
  aws_config,
  getFunc,
  metadata_keys,
  beforeTest,
  tasks,
  deleteTasks
} from './test_utils';
import {system} from '@lib/misc/shell';
import {sleep} from '@lib/misc/helpers';
import {QueueItemStatus} from '@lib/types/queue';
import {S3Controller} from '@lib/storage/storage';


before(async function () {
  await beforeTest(6);
});

describe('browser works with remote queue', async () => {
  it('fetching items from remote queue yields valid results', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('browser.js'),
      task_id: tasks[0],
      worker_id: 53,
      loglevel: 'info',
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.store_in_cloud,
      num_items_worker: 3,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 3);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata).to.have.property('bytes_uploaded');
    expect(response.metadata).to.have.property('avg_items_per_second');
    expect(response.metadata.bytes_uploaded).to.be.above(1000);
    expect(response.metadata.avg_items_per_second).to.be.above(0.1);
    expect(response.metadata.elapsed_crawling_ms).to.be.within(5000, 30000);
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    expect(response.result).to.be.an('array').to.have.length.above(0);

    for (let location of response.result) {
      let ctrl = new S3Controller(location.config);
      let obj = await ctrl.download(location.key);
      expect(obj.Body).to.have.length.above(500);
    }
  });
});

describe('http works with remote queue', async () => {
  it('fetching items from remote queue yields valid results with http', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('browser.js'),
      task_id: tasks[1],
      worker_id: 77,
      loglevel: 'info',
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.store_in_cloud,
      num_items_worker: 3,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 3);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata).to.have.property('bytes_uploaded');
    expect(response.metadata).to.have.property('avg_items_per_second');
    expect(response.metadata.bytes_uploaded).to.be.above(1000);
    expect(response.metadata.avg_items_per_second).to.be.above(0.08);
    expect(response.metadata.elapsed_crawling_ms).to.be.within(5000, 25000);
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    expect(response.result).to.be.an('array').to.have.length.above(0);

    for (let location of response.result) {
      let ctrl = new S3Controller(location.config);
      let obj = await ctrl.download(location.key);
      expect(obj.Body).to.have.length.above(500);
    }
  });
});

describe('items should become initial again when crawling fails', async () => {
  it('sets items back to initial when crawling fails bc no avail proxy', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('http.js'),
      task_id: tasks[2],
      worker_id: 654,
      loglevel: 'verbose',
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.store_in_cloud,
      num_items_worker: 3,
      can_use_proxies: true,
      proxy_options: {
        filter: { provider: 'bliblablub_no_soch_provider' },
        change: 1,
      }
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 0);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // all items in status `initial`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.initial);
    }
  });
});

describe('enqueue items from worker code to itself', async () => {
  it('can enqueue items to itself', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('enqueue.js'),
      task_id: tasks[3],
      worker_id: 1569,
      loglevel: 'info',
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.store_in_cloud,
      num_items_worker: 3,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 3);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // the task consists of 3 items and
    // we enqueue three further items per item
    // after this test, there should be 3 + 3*3 = 12 items into the queue
    let all_items = await endpoint({id: tasks[3]}, 'items', 'POST', process.env.LIVE_API_URL);
    expect(all_items).to.be.an('array').to.have.length(12);
  });
});

describe('enqueue items from worker code to other task', async () => {
  it('can enqueue items to to other task', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('enqueue_other.js'),
      task_id: tasks[4],
      worker_id: 222,
      loglevel: 'info',
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.store_in_cloud,
      num_items_worker: 3,
      can_use_proxies: true,
      options: {
        enqueue_task_id: tasks[5]
      }
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 3);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // the task consists of 3 items and
    // we enqueue one further items per item
    // after this test, there should be 3 + 3*1 = 6 items into the queue
    let all_items = await endpoint({id: tasks[5]}, 'items', 'POST', process.env.LIVE_API_URL);
    expect(all_items).to.be.an('array').to.have.length(6);
  });
});

after(async () => {
  await deleteTasks();
  await turnDown();
});