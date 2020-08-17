import app from "./app";
import * as dotenv from "dotenv";
import {hostname} from 'os';
import fs from 'fs';
import {spawn} from 'child_process';
const got = require('got');

// get a function key from the db
async function getConfigKey(key: string) {
  var options = {
    timeout: 10000,
    method: 'GET',
    retries: 0,
    json: true, // Automatically stringifies the body to JSON
    rejectUnauthorized: false,
  };

  let full_url = process.env.API_URL + 'config' + '&API_KEY=' + process.env.API_KEY;

  try {
    let response = await got(full_url, options);
    return response[key];
  } catch (error) {
    console.error(error);
  }
}

dotenv.config();

let path;
switch (process.env.NODE_ENV) {
  case "test":
    path = `${process.env.APP_DIR}/config/.env.test`;
    break;
  case "production":
    path = `${process.env.APP_DIR}/config/.env.production`;
    break;
  default:
    path = `${process.env.APP_DIR}/config/.env.production`;
}

dotenv.config({ path: path });

const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '0.0.0.0';

let outfile = fs.openSync('./Xvfb_out.log', 'a');
let errfile = fs.openSync('./Xvfb_out.log', 'a');

(async () => {
  // start a Xvfb server to simulate a graphical user interface on allocated servers
  if (await getConfigKey('start_xvfb_server')) {
    console.log("[DOCKER] Starting X virtual framebuffer using: Xvfb $DISPLAY -ac -screen 0 $XVFB_WHD -nolisten tcp");
    const args: Array<string> = [
      process.env['DISPLAY'] || ':99',
      '-ac',
      '-screen 0',
      process.env['XVFB_WHD'] || '1280x720x16',
      '-nolisten',
      'tcp'
    ];
    let child = spawn('Xvfb', args, {
        stdio: [ 'ignore', outfile, errfile], // piping stdout and stderr to out.log
        detached: true
    });
  }

  let server = app.listen(PORT, () => {
    console.log(`CrawlWorker[${hostname()}] with pid ${process.pid} listening on port ${PORT}`);
  });

  // https://github.com/expressjs/express/issues/3330
  // set server timeout to 12 hours
  let timeout: number = 12 * 60 * 60 * 1000;
  server.setTimeout(timeout);
  server.timeout = timeout;
})();
