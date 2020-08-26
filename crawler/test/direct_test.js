// expects the crawl server to run on 0.0.0.0:3333
const got = require("got");
const fs = require("fs");
const path = require("path");
require('dotenv').config({ path: '../env/testing.env' });

function getFunc(scraper_type) {
  let base_path = '/home/nikolai/projects/work/cloudcrawler_functions/';
  return fs.readFileSync(path.join(base_path, scraper_type)).toString();
}

async function call(payload) {
  try {
    let response = await got('http://0.0.0.0:3333/blankSlate', {
      method: 'POST',
      timeout: 20000,
      body: payload,
      json: true,
      https: {
        rejectUnauthorized: false,
      }
    });
    return response.body;
  } catch (err) {
    console.error(err);
  }
}

async function callRemote(payload) {
  try {
    let response = await got('http://167.99.241.135:3333/blankSlate', {
      method: 'POST',
      timeout: 30000,
      body: payload,
      json: true,
      https: {
        rejectUnauthorized: false,
      }
    });
    return response.body;
  } catch (err) {
    console.error(err);
  }
}

let payload = {
  items: ['https://ipinfo.io/json'],
  API_KEY: process.env.API_KEY,
  crawler: 'render',
  loglevel: 'verbose',
  test_evasion: true,
};

let payload4 = {
  items: ['file:///home/nikolai/projects/work/crawling_infrastructure/crawler/test/fingerprint/index2.html'],
  crawler: 'fp',
  API_KEY: process.env.API_KEY,
  loglevel: 'verbose',
  block_webrtc: true,
  apply_evasion: true,
  test_evasion: false,
};

let payload2 = {
  items: ['what is my IP address?'],
  API_KEY: process.env.API_KEY,
  crawler: 'google',
  proxy: 'http://167.99.241.135:3128',
};

let payload3 = {
  items: ['no space no hope'],
  API_KEY: process.env.API_KEY,
  crawler: 'bing',
  //proxy: 'http://167.99.241.135:3128',
  loglevel: 'verbose',
  test_evasion: true,
};

(async () => {
  console.dir(await call(payload2), {depth: null, colors: true});
})();
