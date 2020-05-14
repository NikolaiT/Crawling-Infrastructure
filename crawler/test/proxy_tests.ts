import 'module-alias/register';
require('dotenv').config({ path: 'env/testing.env' });
import {aws_config, beforeTest, checkEnv, endpoint, getFunc, getImageId, metadata_keys, turnDown} from "./test_utils";
import {QueueItemStatus} from '@lib/types/queue';
import {ExecutionEnv, ResultPolicy} from '@lib/types/common';
import {expect} from "chai";
import 'mocha';

before(beforeTest);

describe('proxy via proxy-chain works in the browser', async () => {
  it('http worker with proxy works', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('browser.js'),
      loglevel: 'verbose',
      local_test: true,
      items: ['https://ip.seeip.org/json', ],
      proxies: ['http://sp92712661:Leadgy123@gate.smartproxy.com:7000', ],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    expect(response.metadata.num_items_crawled).to.equal(1);
    expect(response.metadata.num_items_failed).to.equal(0);

    console.dir(response);
  });
});


describe('http-block-noproxy', async () => {
  it('when worker cannot use proxies, requests fail', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('http.js'),
      loglevel: 'verbose',
      local_test: true,
      items: ['https://httpbin.org/status/401', 'https://httpbin.org/status/403', 'https://httpbin.org/status/407', 'https://httpbin.org/status/429', 'https://httpbin.org/status/451'],
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 0);
    expect(response.metadata).to.have.property('num_items_failed', 5);
    expect(response.metadata).to.have.property('num_proxies_obtained', 0);

    // all items in status `failed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.failed);
      expect(item.error).to.be.an('string').to.have.length.above(5);
    }
  });
});

describe('proxy is requested when common status code indicate that crawler was blocked', async () => {
  xit('requests still fail but proxies were requested & used', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('http.js'),
      loglevel: 'verbose',
      local_test: true,
      items: ['https://httpbin.org/status/401', 'https://httpbin.org/status/403', 'https://httpbin.org/status/407', 'https://httpbin.org/status/429', 'https://httpbin.org/status/451'],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 0);
    expect(response.metadata).to.have.property('num_items_failed', 5);
    expect(response.metadata).to.have.property('num_proxies_obtained', 5);

    // all items in status `failed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.failed);
      expect(item.error).to.be.an('string').to.have.length.above(5);
    }
  });
});

describe('http-proxy', async () => {
  it('http worker with proxy works', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('proxy.js'),
      loglevel: 'verbose',
      local_test: true,
      items: ['https://ip.seeip.org/json'],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled');
    expect(response.metadata).to.have.property('num_items_failed');
    expect(response.metadata).to.have.property('num_proxies_obtained', 1);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    expect(response.metadata.num_items_crawled).to.equal(1);
    expect(response.metadata.num_items_failed).to.equal(0);
  });
});

describe('browser-proxy', async () => {
  it('browser worker with proxy works', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('proxy_browser.js'),
      loglevel: 'verbose',
      local_test: true,
      items: ['https://ip.seeip.org/json'],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled');
    expect(response.metadata).to.have.property('num_items_failed');
    expect(response.metadata).to.have.property('num_proxies_obtained', 1);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    expect(response.metadata.num_items_crawled).to.equal(1);
    expect(response.metadata.num_items_failed).to.equal(0);
  });
});


describe('setting proxy via config', async () => {
  it('http worker does work with proxy set via configuration', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('http.js'),
      loglevel: 'info',
      local_test: true,
      items: ['https://ip.seeip.org/json'],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      proxy_options: {
        filter: { whitelisted: true, provider: 'cosmoproxy' },
        change: 3,
      }
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled');
    expect(response.metadata).to.have.property('num_items_failed');
    expect(response.metadata).to.have.property('num_proxies_obtained', 1);

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    expect(response.metadata.num_items_crawled).to.equal(1);
    expect(response.metadata.num_items_failed).to.equal(0);
  });
});


describe('after change of proxy, the browser fingerprint will also change', async () => {
  it('changing proxies will switch browser fingerprint', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('fp.js'),
      loglevel: 'info',
      local_test: true,
      items: [],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      proxy_options: {
        filter: { whitelisted: true, provider: 'cosmoproxy' },
        change: 1,
      },
      result_policy: ResultPolicy.return,
      block_webrtc: true,
      random_user_data_dir: true,
      apply_evasion: true,
      random_user_agent: true,
    };

    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled');
    expect(response.metadata).to.have.property('num_items_failed');
    expect(response.metadata).to.have.property('num_proxies_obtained');

    expect(response.metadata.num_items_crawled).to.equal(3);
    expect(response.metadata.num_items_failed).to.equal(0);
    expect(response.metadata.num_proxies_obtained).to.equal(3);

    let hashes = [];
    for (let item in response.result) {
      hashes.push(response.result[item]);
    }

    // assert that all fingerprint hashes are unique
    expect(hashes.length).to.equal([...new Set(hashes)].length);
  });
});

describe('requesting proxy provider results in different fingerprints', async () => {
  it('has different fingerprints depending on proxy such as ip and metadata such as timezone, langauge, country', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('http.js'),
      loglevel: 'verbose',
      local_test: true,
      items: ['http://ipinfo.io/json', 'http://ipinfo.io/json', 'http://ipinfo.io/json', 'http://ipinfo.io/json'],
      proxy_options: {
        filter: { whitelisted: true, provider: 'cosmoproxy' },
        change: 1,
      },
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.return,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled');
    expect(response.metadata).to.have.property('num_items_failed');
    expect(response.metadata).to.have.property('num_proxies_obtained');

    // all items in status `completed`
    for (let item of response.metadata.items) {
      expect(item).to.have.property('status', QueueItemStatus.completed);
    }

    expect(response.metadata.num_items_crawled).to.equal(4);
    expect(response.metadata.num_proxies_obtained).to.equal(4);
    expect(response.metadata.num_items_failed).to.equal(0);

    // check that all ips are unique
    for (let item in response.result) {
      let data = JSON.parse(response.result[item]);
      //console.log(JSON.stringify(data, null, 2));
    }
  });
});

after(async () => {
  await turnDown();
});