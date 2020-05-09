#!/usr/bin/env node

const argv = require('yargs').argv;
var got = require('got');
var fs = require('fs');
const { execSync } = require('child_process');

if (!process.env.API_URL || !process.env.API_KEY) {
  console.error('Please export API_URL and API_KEY to the env.');
  process.exit(0);
}

let url = process.env.API_URL;
let API_KEY = process.env.API_KEY;

async function call(body, endpoint, method='POST', download=false) {
  let data = {
    API_KEY: API_KEY,
  };

  Object.assign(data, body);

  var options = {
    timeout: 50000000,
    method: method,
    body: data,
    retries: 0,
    json: true, // Automatically stringifies the body to JSON
    rejectUnauthorized: false,
  };

  if (download) {
    options = {
      method: method,
      body: data,
      encoding: null,
      responseType: 'buffer',
    }
  }

  let full_url = url + endpoint;

  if (method.toLowerCase() === 'get') {
    if (full_url.includes('?')) {
      full_url += ('&API_KEY=' + data.API_KEY);
    } else {
      full_url += ('?API_KEY=' + data.API_KEY);
    }
    delete options.body;
  }

  console.log(full_url);

  if (argv.dryrun) {
    return;
  }

  try {
    let response = await got(full_url, options);
    if (download) {
      fs.writeFileSync('data.tar', response.body);
    } else {
      return response.body;
    }
  } catch (error) {
    console.error(error);
  }
}

function getTaskIdOrAbort() {
  let task_id = argv.task_id;
  if (!task_id) {
    console.error('key `task_id` required');
    process.exit(0);
  } else {
    return task_id;
  }
}

function systemSync(cmd) {
  try {
    console.log(cmd);
    return execSync(cmd).toString();
  } catch (error) {
    console.error(error.status);  // Might be 127 in your example.
    console.error(error.message); // Holds the message you typically want.
    if (error.stderr) console.error(error.stderr.toString());  // Holds the stderr output. Use `.toString()`.
    if (error.stdout) console.error(error.stdout.toString());  // Holds the stdout output. Use `.toString()`.
  }
}

(async () => {

  let task_id = '';
  let action = argv.a || argv.action;

  switch (action) {
    case 'task':
      console.dir(await call({}, `task/${getTaskIdOrAbort()}`, 'GET'), {depth: null, colors: true});
      break;
    case 'status':
      console.dir(await call({}, 'tasks', 'GET'), {depth: null, colors: true});
      break;
    case 'stats':
      console.dir(await call({}, 'stats?', 'GET'), {depth: null, colors: true});
      break;
    case 'system':
      console.dir(await call({}, 'system', 'GET'), {depth: null, colors: true});
      break;
    case 'stat':
      console.dir(await call({}, `stats/${getTaskIdOrAbort()}`, 'GET'), {depth: null, colors: true});
      break;
    case 'ips':
      console.dir(await call({}, `ips/${getTaskIdOrAbort()}/?min=60`, 'GET'), {depth: null, colors: true});
      break;
    case 'machines':
      console.dir(await call({}, `machines`, 'GET'), {depth: null, colors: true});
      break;
    case 'delete_machines':
      console.dir(await call({}, `delete_machines`), {depth: null, colors: true});
      break;
    case 'drop':
      console.log(await call({}, 'delete_all'));
      break;
    case 'cfg':
      let todo = argv.what || 'get';
      if (todo === 'get') {
        console.log(await call({}, 'config', 'GET'));
      } else if (todo === 'create') {
        console.log(await call({}, 'config'));
      } else if (todo === 'update') {
        console.log(await call({api_max_concurrency: 100}, 'config', 'PUT'));
      } else if (todo === 'update_regions') {
        let regions = [
          {
            region: 'us-east-1',
            bucket: 'crawling-us-east-1',
            country: 'us'
          },
          {
            region: 'us-east-2',
            bucket: 'crawling-us-east-2',
            country: 'us'
          },
          {
            region: 'us-west-1',
            bucket: 'crawling-us-west-1',
            country: 'us'
          },
          {
            region: 'us-west-2',
            bucket: 'crawling-us-west-2',
            country: 'us'
          }
        ];
        console.log(await call({regions: regions}, 'config', 'PUT'));
      }
      break;
    case 'meta':
      let filter = {
        //status: 2 // lost
      };
      let response = await call({ id: getTaskIdOrAbort(), filter: filter }, 'worker_meta');
      console.log(JSON.stringify(response, null, 2));
      break;
    case 'enqueue':
      let check_function = function check(item_id, result) {
        if (result.includes('Pardon Our Interruption') || result.includes('your browser made us think you were a bot')) {
          return true;
        }
        return false;
      };
      let payload = {
        function: check_function.toString(),
        id: getTaskIdOrAbort(),
        dryrun: 'false'
      };
      console.log(await call(payload, 'enqueue', 'POST'));
      break;
    case 'pauseall':
      console.log(await call({}, 'pause_tasks/', 'POST'));
      break;
    case 'resumeall':
      console.log(await call({}, 'resume_tasks/', 'POST'));
      break;
    case 'update':
      let update = {
        status: 0,
        num_workers_running: 0,
      };

      console.log(await call(update, 'task/' + getTaskIdOrAbort(), 'PUT'));
      break;
    case 'update_all':
      let obj = {
        query: {
          worker_type: 1,
        },
        update: {
          worker_type: 'browser'
        }
      };
      console.log(await call(obj, 'tasks/', 'PUT'));
      break;
    case 'pause':
      console.log(await call({status: "paused"}, 'task/' + getTaskIdOrAbort(), 'PUT'));
      break;
    case 'heal':
      let what = argv.what; // failed or running
      if (!what) {
        console.error('key `what` required');
        process.exit(0);
      }
      console.log(await call({ id: getTaskIdOrAbort(), what: what }, 'heal_queue/', 'POST'));
      break;
    case 'resume':
      console.log(await call({status: 0}, 'task/' + getTaskIdOrAbort(), 'PUT'));
      break;
    case 'fail':
      console.log(await call({status: 2}, 'task/' + getTaskIdOrAbort(), 'PUT'));
      break;
    case 'delete':
      console.log(await call({}, 'task/' + getTaskIdOrAbort(), 'DELETE'));
      break;
    case 'create':
      console.log(await call({}, 'task'));
      break;
    case 'items':
      let res = await call({id: getTaskIdOrAbort(), filter: { status: 3 }, select: '', limit: 10}, 'items', 'POST');
      console.log(JSON.stringify(res));
      break;
    case 'get-items':
      console.log(await call({}, `items/${getTaskIdOrAbort()}`, 'GET'));
      break;
    case 'proxies':
      console.log(await call({}, 'proxies', 'GET'));
      break;
    case 'reload_proxies':
      console.log(await call({}, 'reload_proxies', 'POST'));
      break;
    case 'update_proxies':
      let body = {
        criteria: {
          "provider": "stormproxies",
        },
        update: {
          status: 2,
        }
      };
      console.log(await call(body, 'update_proxies'));
      break;
    case 'loc':
      console.log(await call({id: getTaskIdOrAbort()}, `results`));
      break;
    case 'results':
      let result = await call({}, `results/${getTaskIdOrAbort()}?sample_size=60&recent=1`, 'GET');
      console.log(`Got ${Object.keys(result).length} results`);
      for (let key in result) {
        fs.writeFileSync('samples/' + key + '.html', result[key]);
      }
      break;
    case 'storage':
      let how = argv.how; // `cmd` or `flat`
      console.log(await call({}, `storage/${getTaskIdOrAbort()}?how=${how}`, 'GET'));
      break;
    case 'down':
      let id = getTaskIdOrAbort();
      // it's better to handle downloads with curl
      let cmd = `curl --max-time 10000 ${url}download_task/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY":"${API_KEY}", "id": "${id}"}' -o ${id}.tar`;
      systemSync(cmd);
      break;
    case 'down_sample':
      systemSync(`curl --max-time 20000 ${url}download_sample?sample_size=20&id=${getTaskIdOrAbort()}&API_KEY=${API_KEY}`);
      break;
    default:
      console.log('Unknown action: ' + argv.action);
      break;
  }
})();
