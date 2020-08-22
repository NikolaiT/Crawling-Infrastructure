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

let payload = {
  items: ['https://ipinfo.io/json'],
  function_code: getFunc('new_browser.js'),
  chromium_binary: '/usr/bin/chromium-browser',
  API_KEY: process.env.API_KEY,
  proxy: 'http://167.99.241.135:3128',
  loglevel: 'verbose',
};

let payload2 = {
  items: ['what is my ip address?'],
  function_code: getFunc('new_google_scraper.js'),
  chromium_binary: '/usr/bin/chromium-browser',
  API_KEY: process.env.API_KEY,
  //proxy: 'http://167.99.241.135:3128',
  loglevel: 'verbose',
};

let payload3 = {
  items: ['what is my ip address?'],
  function_code: getFunc('new_bing_scraper.js'),
  chromium_binary: '/usr/bin/chromium-browser',
  API_KEY: process.env.API_KEY,
  //proxy: 'http://167.99.241.135:3128',
  loglevel: 'verbose',
};

(async () => {
  console.dir(await call(payload), {depth: null, colors: true});
})();
