import 'module-alias/register';
require('dotenv').config({ path: 'env/testing.env' });
import {aws_config, beforeTest, checkEnv, endpoint, getFunc, getImageId, metadata_keys, turnDown} from "./test_utils";
import {QueueItemStatus} from '@lib/types/queue';
import {ExecutionEnv, ResultPolicy} from '@lib/types/common';
import {expect} from "chai";
import {launchTestServer} from './test_server';
import 'mocha';

before(beforeTest);

let test_server = launchTestServer();

let proxies = [
  {url: 'http://167.99.241.135:3128', ip: '167.99.241.135'},
  {url: 'http://139.59.136.53:3128', ip: '139.59.136.53'},
  {url: '', ip: ''},
 ];

 describe('crawl response times should be significanly faster after the first crawl', async () => {
   it('crawls 5 keywords and the response time of the last 4 crawls should be quite fast', async () => {
     let measurements = [];
     let keywords = ['politics news', 'weather today', 'founding a business', 'nothing around us', 'the last of us'];
     let start = null;
     let stop = null;
     for (let kw of keywords) {
       start = new Date();
       let payload = {
         items: [kw],
         function_code: getFunc('new_google_scraper.js'),
         API_KEY: process.env.API_KEY,
         loglevel: 'info',
       };
       let response = await endpoint(payload, 'blankSlate', 'POST');
       //console.dir(response);
       for (let obj of response) {
         for (let res of obj) {
           expect(res.results).to.be.an('array').to.have.length.within(3, 11);
           expect(res.num_results).to.be.an('string').that.is.not.empty;
           expect(res.no_results).to.equal(false);
           expect(res.page_num).to.be.an('number').that.is.above(0);
         }
       }
       stop = new Date();
       measurements.push(stop.valueOf()-start.valueOf());
     }
     console.log(measurements);
     for (var i = 1; i < measurements.length; i++) {
       expect(measurements[0]).to.be.above(measurements[i]);
     }
   });
 });

describe('changing proxies works while browser keeps alive', async () => {
  it('changes IP address when changing the proxy', async () => {
    for (let proxy of proxies) {
      let payload = {
        items: ['https://ipinfo.io/json'],
        function_code: getFunc('new_render.js'),
        API_KEY: process.env.API_KEY,
        proxy: proxy.url,
        loglevel: 'info',
      };
      let response = await endpoint(payload, 'blankSlate', 'POST');
      let ipinfo = JSON.parse(response);
      console.log(ipinfo);

      if (proxy.ip) {
        expect(ipinfo.ip).to.equal(proxy.ip);
      } else {
        // when not using proxy, the ip is smth else
        expect(ipinfo.ip).to.not.equal(proxies[0].ip);
        expect(ipinfo.ip).to.not.equal(proxies[1].ip);
      }
    }
  });
});

describe('crawling google works with proxies', async () => {
  it('should return proper google serp results when using proxies and google should show matching proxy', async () => {
    for (let proxy of proxies) {
      let payload = {
        items: ['what is my ip address?'],
        function_code: getFunc('new_google_scraper.js'),
        API_KEY: process.env.API_KEY,
        proxy: proxy.url,
        loglevel: 'info',
      };
      let response = await endpoint(payload, 'blankSlate', 'POST');
      //console.dir(response);
      for (let obj of response) {
        for (let res of obj) {
          expect(res.miniapps).to.be.an('string').to.contain(proxy.ip);
          console.log(proxy.ip + ' appears in miniapps');
          expect(res.results).to.be.an('array').to.have.length.within(3, 11);
          expect(res.num_results).to.be.an('string').that.is.not.empty;
          expect(res.no_results).to.equal(false);
          expect(res.page_num).to.be.an('number').that.is.above(0);
        }
      }
    }
  });
});

describe('user agent changes on subsequent crawls', async () => {
  it('user agent can be changed', async () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36';
    let payload = {
      items: ['http://0.0.0.0:8888/headers'],
      function_code: getFunc('new_render.js'),
      API_KEY: process.env.API_KEY,
      loglevel: 'info',
      user_agent: ua
    };
    let response = await endpoint(payload, 'blankSlate', 'POST');
    let headers = JSON.parse(response);
    expect(headers['user-agent']).to.equal(ua);
    //console.log(headers);
  });
});

describe('custom headers can be set', async () => {
  it('should set the headers according to the option', async () => {
    const custom_headers = {
      //'accept-language':"bs-BA",
      'cookie': 'PHPSESSID=298zf09hf012fh2; csrftoken=u32t4o3tb3gg43; _gat=1',
      //'user-agent': 'testTest'
    };
    let payload = {
      items: ['http://0.0.0.0:8888/headers'],
      function_code: getFunc('new_render.js'),
      API_KEY: process.env.API_KEY,
      loglevel: 'verbose',
      headers: custom_headers
    };
    let response = await endpoint(payload, 'blankSlate', 'POST');
    let headers = JSON.parse(response);
    console.log(headers);
    expect(headers['cookie']).to.equal(custom_headers['cookie']);
    //expect(headers["accept-language"]).to.equal(custom_headers["accept-language"]);
    //expect(headers['user-agent']).to.equal(custom_headers['user-agent']);
  });
});

describe('timezone changes on subsequent crawls', async () => {
  it('', async () => {
  });
});

describe('language changes on subsequent crawls', async () => {
  it('', async () => {
  });
});

after(async () => {
  await test_server.close(() => {
    console.log('test server closed');
  });
  await turnDown();
});
