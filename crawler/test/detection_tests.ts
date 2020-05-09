import 'module-alias/register';
require('dotenv').config({ path: 'test/test.env' });
import {aws_config, endpoint, getFunc, metadata_keys, turnDown, beforeTest} from "./test_utils";
import {ExecutionEnv, ResultPolicy} from '@lib/types/common';
import {S3Controller} from '@lib/storage/storage';
import {expect} from "chai";
import 'mocha';

before(beforeTest);

describe('webrtc is not detected', async () => {
  it('crawler will not reveal real ip address via webrtc', async () => {
    let payload = {
      aws_config: aws_config,
      execution_env: ExecutionEnv.docker,
      function_code: getFunc('webrtc_check.js'),
      loglevel: 'info',
      local_test: true,
      items: ['https://www.expressvpn.com/webrtc-leak-test', 'https://www.hidemyass.com/webrtc-leak-test'],
      mongodb_url: process.env.MONGODB_CONNECTION_URL,
      result_policy: ResultPolicy.store_in_cloud,
      block_webrtc: true,
      random_user_data_dir: true,
      apply_evasion: true,
      random_user_agent: true,
      compress: false,
    };
    let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
    expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

    expect(response.metadata).to.include.keys(metadata_keys);
    expect(response.metadata).to.have.property('num_items_crawled', 2);
    expect(response.metadata).to.have.property('num_items_failed', 0);
    expect(response.metadata).to.have.property('num_proxies_obtained', 0);

    expect(response.result).to.be.an('array').to.have.length.above(0);

    for (let location of response.result) {
      let ctrl = new S3Controller(location.config);
      let obj = await ctrl.download(location.key);

      if (obj.Body) {
        let html = obj.Body.toString();
        expect(html).to.equal('no_ip_leak');
      }
    }
  });
});

after(async () => {
  await turnDown();
});