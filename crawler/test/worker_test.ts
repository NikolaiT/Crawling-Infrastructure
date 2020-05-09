import 'module-alias/register';
require('dotenv').config({ path: 'test/test.env' });
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
} from './test_utils';
import {QueueItemStatus} from '@lib/types/queue';

before(beforeTest);

describe('google worker', async () => {
  it('google worker can crawl certain keywords', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['us election', 'travel restrictions'],
      function: getFunc('google_scraper.js'),
      task_id: '1',
      worker_id: 1,
      loglevel: 'info',
      result_policy: ResultPolicy.return,
      apply_evasion: false,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 2);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata).to.have.property('avg_items_per_second');
    expect(response.metadata.avg_items_per_second).to.be.above(0.1);
    expect(response.metadata.elapsed_crawling_ms).to.be.within(1000, 24000);
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    for (let obj of response.result) {
      for (let res of obj.result) {
        expect(res.results).to.be.an('array').to.have.length.within(5, 11);
        expect(res.num_results).to.be.an('string').that.is.not.empty;
        expect(res.no_results).to.equal(false);
        expect(res.page_num).to.be.an('number').that.is.above(0);
      }
    }
  });
});

describe('bing worker', async () => {
  it('bing worker can crawl certain keywords', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['us election', 'travel restrictions'],
      function: getFunc('bing_scraper.js'),
      task_id: '1',
      worker_id: 1,
      loglevel: 'info',
      result_policy: ResultPolicy.return,
      apply_evasion: false,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 2);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata).to.have.property('avg_items_per_second');
    expect(response.metadata.avg_items_per_second).to.be.above(0.1);
    expect(response.metadata.elapsed_crawling_ms).to.be.within(1000, 24000);
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    for (let obj of response.result) {
      for (let res of obj.result) {
        expect(res.results).to.be.an('array').to.have.length.within(5, 11);
        expect(res.num_results).to.be.an('string').that.is.not.empty;
        expect(res.no_results).to.equal(false);
        expect(res.page_num).to.be.an('number').that.is.above(0);
      }
    }
  });
});


describe('nytimes worker', async () => {
  it('nytimes scraper works', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['dummy'],
      function: getFunc('nytimes.js'),
      task_id: '1',
      worker_id: 1,
      loglevel: 'info',
      result_policy: ResultPolicy.return,
      apply_evasion: false,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 1);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata).to.have.property('avg_items_per_second');
    expect(response.metadata.avg_items_per_second).to.be.above(0.05);
    expect(response.metadata.elapsed_crawling_ms).to.be.within(1000, 24000);
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    // console.dir(response.result, {depth: null, colors: true});

    for (let obj of response.result) {
      expect(obj.result).to.be.an('array').to.have.length.within(4, 10);

      for (let headline of obj.result) {
        expect(headline.headline).to.be.an('string').that.is.not.empty;
        expect(headline.snippet).to.be.an('string').that.is.not.empty;
        expect(headline.link).to.be.an('string').that.is.not.empty;
      }
    }
  });
});

after(async () => {
  await turnDown();
});
