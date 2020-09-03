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
 ];

 describe('webrtc is not detected', async () => {
   it('crawler will not reveal real ip address via webrtc', async () => {
     for (let proxy of proxies) {
       let payload = {
         crawler: 'webrtc',
         loglevel: 'info',
         items: ['https://ip.voidsec.com/'],
         proxy: proxy.url,
         block_webrtc: true,
       };
       let response = await endpoint(payload, 'blankSlate', 'POST');
       console.log(`checking that ${response.results[0].ip} = ${proxy.ip}`)
       expect(response.results[0].ip).to.equal(proxy.ip);
     }
   });
 });

 describe('webrtc is detected when not using evasion', async () => {
   it('crawler will reveal real ip address via webrtc', async () => {
     for (let proxy of proxies) {
       let payload = {
         crawler: 'webrtc',
         loglevel: 'info',
         items: ['https://ip.voidsec.com/'],
         proxy: proxy.url,
         block_webrtc: false
       };
       let response = await endpoint(payload, 'blankSlate', 'POST');
       console.log(`checking that webrtc leak occurs: ${JSON.stringify(response.results[0])}`);
       // ip that traffic is routed through is proxy ip
       expect(response.results[0].ip).to.equal(proxy.ip);
       // ip that traffic is routed through differs from the leaked ip address
       // we have a leak
       expect(response.results[0].ip).to.not.equal(response.results[0].leaked);
       // the proxy ip address is not the same as the leaked one
       expect(proxy.ip).to.not.equal(response.results[0].leaked);
     }
   });
 });


 describe('cookies and cache is closed on subsequent api calls', async () => {
   it('a page cannot save state among two idependent api calls', async () => {

   });
 });

after(async () => {
  await test_server.close(() => {
    console.log('test server closed');
  });
  await turnDown();
});
