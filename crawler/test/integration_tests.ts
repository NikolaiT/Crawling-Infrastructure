import 'module-alias/register';
require('dotenv').config({ path: 'env/testing.env' });
import { expect } from 'chai';
import 'mocha';
import {ExecutionEnv, ResultPolicy} from '@lib/types/common';
import {QueueItemStatus} from '@lib/types/queue';
import {S3Controller} from '@lib/storage/storage';
import {
  turnDown,
  endpoint,
  aws_config,
  getFunc,
  metadata_keys,
  beforeTest,
  test_urls
} from './test_utils';
import fs from "fs";

before(beforeTest);

// https://medium.com/building-ibotta/testing-arrays-and-objects-with-chai-js-4b372310fe6d
// https://gist.github.com/yoavniran/1e3b0162e1545055429e

describe('Crawler is online', async () => {
  it('should return a valid welcome json object', async () => {
    let worker_info = await endpoint({}, '', 'GET');
    expect(worker_info).to.have.keys(['status', 'message', 'version', 'author', 'platform', 'totalmem', 'uptime', 'env', 'free']);
    expect(worker_info).to.have.property('status', 200);
    expect(worker_info.message).contains('Welcome to CrawlWorker');
  });
});

describe('worker can crawl with browser', async () => {
  it('should return valid html string as result', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['https://ipinfo.io/json'],
      function_code: getFunc('browser.js'),
      local_test: true,
      loglevel: 'verbose',
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    for (let obj of response.result) {
      expect(obj.result).to.have.length.above(50);
    }

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 1);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata).to.have.property('bytes_uploaded', 0);
    expect(response.metadata).to.have.property('avg_items_per_second');
    expect(response.metadata.avg_items_per_second).to.be.above(0.001);
    expect(response.metadata.elapsed_crawling_ms).to.be.within(100, 5000);
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }
  });
});

describe('worker can crawl with http', async () => {
  it('should return valid html string as result', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['https://ipinfo.io/json'],
      function_code: getFunc('http.js'),
      local_test: true,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    for (let obj of response.result) {
      expect(obj.result).to.have.length.above(50);
    }

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 1);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(new Date(response.metadata.crawling_ended)).to.be.above(new Date(response.metadata.crawling_started));
    expect(response.metadata).to.have.property('bytes_uploaded', 0);
    expect(response.metadata).to.have.property('avg_items_per_second');
    expect(response.metadata.avg_items_per_second).to.be.above(0.001);
    expect(response.metadata.elapsed_crawling_ms).to.be.within(200, 10000);
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }
  });
});


describe('browser can set headers', async () => {
  it('should reflect headers that were sent', async () => {

    let headers = {
      'X-Test-Header': 'finally2020',
      'Referer': 'https://scrapeulous.com/'
    };

    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['https://httpbin.org/get'],
      function_code: getFunc('pre.js'),
      headers: headers,
      local_test: true,
      user_agent: 'dummytest'
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 1);
    expect(response.metadata).to.have.property('num_items_failed', 0);

    let req: any = JSON.parse(response.result[0].result);

    expect(req.headers['X-Test-Header']).to.equal(headers['X-Test-Header']);
    expect(req.headers['Referer']).to.equal(headers['Referer']);
    expect(req.headers['User-Agent']).to.equal(payload.user_agent);
  });
});


describe('http can set headers', async () => {
  it('should reflect headers that were sent', async () => {

    let headers = {
      'User-Agent': 'dummytest',
      'X-Test-Header': 'finally2020',
      'Referer': 'https://scrapeulous.com/'
    };

    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['https://httpbin.org/get'],
      function_code: getFunc('http.js'),
      headers: headers,
      local_test: true,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 1);
    expect(response.metadata).to.have.property('num_items_failed', 0);

    let req: any = JSON.parse(response.result[0].result);

    expect(req.headers['X-Test-Header']).to.equal(headers['X-Test-Header']);
    expect(req.headers['Referer']).to.equal(headers['Referer']);
    expect(req.headers['User-Agent']).to.equal(headers['User-Agent']);
  });
});

describe('browser can set cookies and user agent', async () => {
  it('should reflect the cookies and user agent that were set', async () => {
    let cookies = [
      {
        name: 'someCookie',
        value: '4353453453',
        domain: 'httpbin.org'
      },
      {
        name: 'alloutLove',
        value: '777',
        domain: 'httpbin.org'
      },
      {
        name: 'badboy',
        value: 'what',
        domain: 'what.org'
      },
    ];

    let user_agent = 'crawler2020';

    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['https://httpbin.org/headers'],
      function_code: getFunc('pre.js'),
      cookies: cookies,
      user_agent: user_agent,
      local_test: true,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 1);
    expect(response.metadata).to.have.property('num_items_failed', 0);

    let req: any = JSON.parse(response.result[0].result);

    expect(req.headers["User-Agent"]).to.equal(user_agent);
    expect(req.headers["Cookie"]).to.contain('someCookie=4353453453');
    expect(req.headers["Cookie"]).to.contain('alloutLove=777');
    expect(req.headers["Cookie"]).to.not.contain('badboy=what');
  });
});


describe('http can set cookies and user agent', async () => {
  xit('should reflect the cookies and user agent that were set', async () => {
    let cookies = [
      {
        name: 'someCookie',
        value: '4353453453',
        domain: 'httpbin.org'
      },
      {
        name: 'alloutLove',
        value: '777',
        domain: 'httpbin.org'
      },
      {
        name: 'badboy',
        value: 'what',
        domain: 'what.org'
      },
    ];

    let user_agent = 'crawler2020';

    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['https://httpbin.org/headers'],
      function_code: getFunc('http.js'),
      cookies: cookies,
      user_agent: user_agent,
      loglevel: 'info',
      local_test: true,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 1);
    expect(response.metadata).to.have.property('num_items_failed', 0);

    let req: any = JSON.parse(response.result[0].result);

    expect(req.headers["User-Agent"]).to.equal(user_agent);
    expect(req.headers).to.have.key('Cookie');
    expect(req.headers["Cookie"]).to.contain('someCookie=4353453453');
    expect(req.headers["Cookie"]).to.contain('alloutLove=777');
    expect(req.headers["Cookie"]).to.not.contain('badboy=what');
  });
});

describe('http-timing', async () => {
  it('http crawling should be fast', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['https://scrapeulous.com', 'https://google.com', 'https://bing.com'],
      function_code: getFunc('http.js'),
      loglevel: 'verbose',
      local_test: true,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 3);
    expect(response.metadata).to.have.property('num_items_failed', 0);

    expect(response.metadata.avg_items_per_second).to.be.within(0.25, 5.0);
    expect(response.metadata.elapsed_crawling_ms).to.be.within(500, 5000);
    expect(response.metadata.elapsed_crawling_ms).to.be.lt(response.metadata.elapsed_ms);

    for (let obj of response.result) {
      expect(obj.result).to.have.length.above(1000);
    }

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }
  });
});

describe('invalid-config', async () => {
  it('worker should response appropriately on invalid input', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('browser.js'),
      loglevel: 'verbose',
      local_test: true,
      worker_id: -3453,
      task_id: '34534222',
      mongodb_url: 'http://invalid'
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.message).to.include('Unable to connect to mongodb');
    expect(response.status).to.equal(400);
  });
});

describe('partly-invalid-config', async () => {
  it('worker should response appropriately on partly invalid input', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('browser.js'),
      loglevel: 'verbose',
      local_test: true,
      worker_id: -3453,
      task_id: '34534222',
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      num_items_worker: 3,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.message).to.include('No items in queue. No work to do.');
    expect(response.status).to.equal(200);
  });
});

describe('results are stored in s3 cloud', async () => {
  it('crawls two urls and stores results compressed in cloud', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('browser.js'),
      loglevel: 'info',
      local_test: true,
      items: ['https://github.com', 'https://heise.de'],
      can_use_proxies: true,
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.store_in_cloud,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 2);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(response.metadata).to.have.property('num_proxies_obtained', 0);
    expect(response.result).to.be.an('array').to.have.length.above(0);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    for (let location of response.result) {
      let ctrl = new S3Controller(location.config);
      let obj = await ctrl.download(location.key);
      expect(obj.Body).to.have.length.above(500);
    }
  });
});

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language
describe('sleeping randomly delays execution as expected', async () => {
  it('random normal sleep delays execution and is measurable in the end', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('http.js'),
      loglevel: 'verbose',
      local_test: true,
      items: test_urls,
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      random_normal_sleep: {mean: 5, stddev: 2}, // we sleep around 5s
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', test_urls.length);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(response.metadata).to.have.property('num_proxies_obtained', 0);
    expect(response.metadata.elapsed_crawling_ms).to.be.within(test_urls.length*3000, (test_urls.length + 2)*5000);
  });
});


describe('defect worker will save debug info when config is set', async () => {
  it('stores appropriate debug information', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      items: ['https://google.com'],
      function_code: getFunc('fail.js'),
      local_test: true,
      store_browser_debug: true,
      result_policy: ResultPolicy.return,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);
    expect(response).to.have.property('status', 200);

    let i = 0;
    for (let res of response.result) {
      expect(res.result.screen_b64).to.have.length.above(5000);
      expect(res.result.document).to.have.length.above(5000);
      fs.writeFileSync(`test/screens/fail${i++}.png`, Buffer.from(res.result.screen_b64, 'base64'));
    }

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 0);
    expect(response.metadata).to.have.property('num_items_failed', 1);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.failed);
    }
  });
});


after(async () => {
  await turnDown();
});
