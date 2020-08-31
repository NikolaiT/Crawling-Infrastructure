// expects the crawl server to run on 0.0.0.0:3333
const got = require("got");
const fs = require("fs");
const path = require("path");
require('dotenv').config({ path: '../env/crawler_server.env' });

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
  items: ['what is my ip address?'],
  API_KEY: process.env.API_KEY,
  crawler: 'google',
};

let payload2 = {
  items: ["https://ipinfo.io/json"],
  API_KEY: process.env.API_KEY,
  crawler: 'render',
  //proxy: "http://167.99.241.135:3128",
  proxy: 'http://139.59.136.53:3128',
};

let payload3 = {
  items: ['what is my ip address?'],
  API_KEY: process.env.API_KEY,
  crawler: 'google',
  proxy: 'http://139.59.136.53:3128',
  no_cache: true,
};

let payload4 = {
  items: ['what is my ip address?'],
  API_KEY: process.env.API_KEY,
  crawler: 'google',
  proxy: 'http://167.99.241.135:3128',
  no_cache: true,
};

(async () => {
  console.dir(await call(payload3), {depth: null, colors: true});
  console.dir(await call(payload4), {depth: null, colors: true});

  console.dir(await call(payload3), {depth: null, colors: true});
  console.dir(await call(payload4), {depth: null, colors: true});
})();
