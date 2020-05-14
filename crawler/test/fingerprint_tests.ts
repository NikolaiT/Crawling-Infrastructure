import 'module-alias/register';
require('dotenv').config({ path: 'env/testing.env' });
import {aws_config, beforeTest, endpoint, getFunc, metadata_keys, turnDown} from "./test_utils";
import {QueueItemStatus} from '@lib/types/queue';
import {ExecutionEnv, ResultPolicy} from '@lib/types/common';
import {expect} from "chai";
import 'mocha';
import {system} from '@lib/misc/shell';
import {sleep} from '@lib/misc/helpers';
import fs from 'fs';

before(beforeTest);

describe('switching user agents changes fingerprint hash when using proxies', async () => {
  it('changing user agent should change the hash when using proxies', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('fp.js'),
      loglevel: 'verbose',
      local_test: true,
      items: ['', ''],
      can_use_proxies: true,
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.return,
      random_user_agent: true,
      proxy_options: {
        filter: { whitelisted: true, provider: 'cosmoproxy' },
        change: 1,
      },
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 2);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(response.metadata).to.have.property('num_proxies_obtained', 2);

    let hashes = [];
    for (let item in response.result) {
      let data = JSON.parse(response.result[item]);
      console.log(data["userAgent"]);
      hashes.push(data.hash);
    }

    console.log(hashes);
    // assert that all fingerprint hashes are unique
    expect(hashes.length).to.equal([...new Set(hashes)].length);
  });
});

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language
describe('switching accept language header does not change fingerprint hash when using proxies', async () => {
  it('the accept language header does not influence the fingerprint created', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('fp.js'),
      loglevel: 'verbose',
      local_test: true,
      items: [''],
      can_use_proxies: true,
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.return,
      random_accept_language: true,
      proxy_options: {
        filter: { whitelisted: true, provider: 'cosmoproxy' },
        change: 1,
      },
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 3);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(response.metadata).to.have.property('num_proxies_obtained', 3);

    let hashes = [];
    for (let item in response.result) {
      let data = JSON.parse(response.result[item]);
      hashes.push(data.hash);
    }

    console.log(hashes);
    // assert that all fingerprint hashes are equal
    expect([...new Set(hashes)].length).to.equal(1);
  });
});


// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language
describe('random accept language header does work', async () => {
  it('creates at least three random different accept language headers in four restarts', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('http.js'),
      loglevel: 'info',
      local_test: true,
      items: [],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.return,
      random_accept_language: true,
      restart_before_crawl: true,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 4);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(response.metadata).to.have.property('num_proxies_obtained', 0);

    let accept_language_headers = [];
    for (let item in response.result) {
      let data = JSON.parse(response.result[item]);
      accept_language_headers.push(data.headers["accept-language"]);
    }

    console.log(accept_language_headers);
    // assert that all fingerprint hashes are unique
    let num_unique = [...new Set(accept_language_headers)].length;
    expect(num_unique).to.be.within(3, 4);
  });
});


describe('fingerprint does not detect webdriver', async () => {
  it('should not detect a webdriver', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('fp.js'),
      loglevel: 'verbose',
      local_test: true,
      items: [''],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.return,
      apply_evasion: true,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 1);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(response.metadata).to.have.property('num_proxies_obtained', 0);

    for (let item in response.result) {
      let data = JSON.parse(response.result[item]);
      data.canvas = '';
      data.webgl = '';
      // console.log(JSON.stringify(data, null, 2));
      expect(data.webdriver).to.equal("not available");
    }
  });
});


// problem: navigator platform is Linux when not setting and Windows when using stealth plugin
// we however want to set navigator.platform according to the user agent, such that we don't lie
describe('hasLiedOs is false when fingerprinting', async () => {
  it('when using random user agents, the platform should be updated accordingly', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('fp.js'),
      loglevel: 'verbose',
      local_test: true,
      items: [''],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.return,
      apply_evasion: true,
      random_user_agent: true,
      restart_before_crawl: true
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 3);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(response.metadata).to.have.property('num_proxies_obtained', 0);

    for (let item in response.result) {
      let data = JSON.parse(response.result[item]);
      // console.log(JSON.stringify(data, null, 2));
      expect(data.hasLiedLanguages).to.equal(false);
      expect(data.hasLiedResolution).to.equal(false);
      expect(data.hasLiedOs).to.equal(false);
      expect(data.hasLiedBrowser).to.equal(false);
    }
  });
});

describe('check that crawler is not detected as bot on https://bot.sannysoft.com/', async () => {
  it('should not detect crawler as bot', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('check_bot.js'),
      loglevel: 'verbose',
      local_test: true,
      items: ['https://bot.sannysoft.com/'],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.return,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 1);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(response.metadata).to.have.property('num_proxies_obtained', 0);

    for (let item in response.result) {
      let obj = response.result[item];
      fs.writeFileSync('test/screens/bottest.png', Buffer.from(obj.screen, 'base64'));
      expect(obj.passed).to.equal("passed");
    }
  });
});

after(async () => {
  await turnDown();
});