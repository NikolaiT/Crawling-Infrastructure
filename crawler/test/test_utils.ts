import 'module-alias/register';
const got = require('got');
const fs = require('fs');
const path = require('path');
import {system} from '@lib/misc/shell';
import {sleep} from '@lib/misc/helpers';

export const metadata_keys = ['avg_items_per_second', 'num_items_crawled',
  'elapsed_crawling_ms', 'elapsed_ms', 'started', 'num_proxies_obtained',
  'ended', 'crawling_ended', 'crawling_started', 'bytes_uploaded', 'num_items_failed', 'items'];

export const test_urls = ['https://scrapeulous.com', 'https://google.com', 'https://bing.com'];

export let aws_config = {
  "AWS_ACCESS_KEY": process.env.AWS_ACCESS_KEY,
  "AWS_SECRET_KEY": process.env.AWS_SECRET_KEY,
  "AWS_REGION": process.env.AWS_REGION,
  "AWS_BUCKET": process.env.AWS_BUCKET
};

export let tasks: Array<string> = [];

export async function endpoint(body: any, endpoint: string, method='POST', api_url: string = '', timeout: number = 0) {
  let data = {
    API_KEY: process.env.API_KEY,
  };

  Object.assign(data, body);

  const options = {
    timeout: timeout | 90000,
    method: method,
    body: data,
    retry: 0, // https://www.npmjs.com/package/got#retry
    json: true // Automatically stringifies the body to JSON
  };

  let url = api_url || process.env.API_URL;

  let full_url = url + endpoint;

  if (method.toLowerCase() === 'get') {
    if (full_url.includes('?')) {
      full_url += ('&API_KEY=' + data.API_KEY);
    } else {
      full_url += ('?API_KEY=' + data.API_KEY);
    }
    delete options.body;
  }
  try {
    let response = await got(full_url, options);
    return response.body;
  } catch (error) {
    // dont print whole Got stack
    console.error(`Got request to ${full_url} failed with Error: ${error.message}`);
    console.error(error);
  }
}

export function getFunc(scraper_type: string) {
  let base_path = '/home/nikolai/projects/work/cloudcrawler_functions/';
  return fs.readFileSync(path.join(base_path, scraper_type)).toString();
}

export function checkEnv() {
  const required = ['API_KEY', 'API_URL', 'AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'AWS_REGION', 'AWS_BUCKET'];
  for (let key of required) {
    if (!process.env[key]) {
      console.error(`Key ${key} required`);
      process.exit(0);
    }
  }
}

export async function getImageId() {
  let response = await system(`docker ps | grep 'crawl_worker' | awk '{ print $1 }'`);
  return response.stdout.trim();
}

export async function turnDown() {
  let image_id = await getImageId();
  if (image_id) {
    let turn_down_cmd = `docker kill ${image_id}`;
    await system(turn_down_cmd);
  }
}

export async function createTasks(num_tasks: number = 0) {
  for (let i = 0; i < num_tasks; i++) {
    let payload = {
      status: 3,
      max_items_per_second: 1,
      function: 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/http.js',
      items: test_urls
    };
    let response = await endpoint(payload, 'task', 'POST', process.env.LIVE_API_URL);
    tasks.push(response._id);
  }
}

export async function deleteTasks() {
  for (let task_id of tasks) {
    let response = await endpoint({}, 'task/' + task_id, 'DELETE', process.env.LIVE_API_URL);
    console.log(response);
  }
}

export async function beforeTest(num_tasks: number = 0, env: Array<string> = []) {
  checkEnv();
  // launch the worker docker instance if it is not running
  await turnDown();
  let imgid = await getImageId();
  if (!imgid) {
    let env_string = '';
    if (env.length) {
      env_string = '--env ' + env.join(' --env ');
    }

    let cmd = 'docker run --detach -p 4444:4444 --env PORT=4444 tschachn/crawl_worker:latest';

    if (env_string) {
      cmd = `docker run --detach -p 4444:4444 --env PORT=4444 ${env_string} tschachn/crawl_worker:latest`;
    }

    console.log(cmd);

    let response  = await system(cmd);
    console.log(`Image id: ${await getImageId()}`);
    // starting the server in the background takes a few seconds,
    await sleep(5000);
    console.log(`Crawler should be online on http://localhost:4444/`);
  }

  if (num_tasks > 0) {
    await createTasks(num_tasks);
    console.log(tasks);
  }
}