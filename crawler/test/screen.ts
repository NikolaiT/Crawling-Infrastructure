import 'module-alias/register';
require('dotenv').config({ path: 'env/testing.env' });
import {aws_config, endpoint, getFunc, metadata_keys, beforeTest, turnDown} from "./test_utils";
import {ExecutionEnv, ResultPolicy} from '@lib/types/common';
import {expect} from "chai";
import 'mocha';

describe('switching screen size changes fingerprint', async () => {
  it('changes the browser fingerprint when restarting the browser with different screen resolution', async () => {
    let hashes = [];
    let test_viewports = [{width: 1920, height: 1080}, {width: 1280, height: 720}, {width: 1440, height: 900}];

    for (let viewport of test_viewports) {
      await beforeTest(0, [`XVFB_WHD=${viewport.width}x${viewport.height}x16`, ]);

      let payload = {
        aws_config: aws_config,
        execution_env: ExecutionEnv.docker,
        function: getFunc('fp.js'),
        loglevel: 'verbose',
        local_test: true,
        items: [''],
        mongodb_url: process.env.MONGODB_CONNECTION_URL,
        result_policy: ResultPolicy.return,
        viewport: viewport,
      };
      let response = await endpoint(payload, 'invokeRequestResponse', 'POST');
      expect(response).to.include.keys(['status', 'message', 'result', 'metadata']);

      expect(response.metadata).to.include.keys(metadata_keys);
      expect(response.metadata).to.have.property('num_items_crawled', 1);
      expect(response.metadata).to.have.property('num_items_failed', 0);
      expect(response.metadata).to.have.property('num_proxies_obtained', 0);

      for (let item in response.result) {
        let data = JSON.parse(response.result[item]);
        console.log(`screen resolution ${data.screenResolution} produces hash ${data.hash}`);
        hashes.push(data.hash);
      }

      await turnDown();
    }

    // assert that all fingerprint hashes are unique
    // because xvfg was started with different screen resolutions
    expect(hashes.length).to.equal([...new Set(hashes)].length);
  });
});