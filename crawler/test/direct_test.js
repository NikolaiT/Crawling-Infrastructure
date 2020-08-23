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
  function_code: getFunc('new_render.js'),
  API_KEY: process.env.API_KEY,
  crawler: 'render'
};

let payload2 = {
  items: ['What is my IP address?'],
  function_code: getFunc('new_google_scraper.js'),
  API_KEY: process.env.API_KEY,
  crawler: 'google'
};

let payload3 = {
  items: ['no space no hope'],
  function_code: getFunc('new_bing_scraper.js'),
  API_KEY: process.env.API_KEY,
  crawler: 'bing'
  //proxy: 'http://167.99.241.135:3128',
};

(async () => {
  console.dir(await call(payload2), {depth: null, colors: true});
})();
