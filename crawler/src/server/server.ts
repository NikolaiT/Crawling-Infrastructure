import app from "./app";
import * as dotenv from "dotenv";
import {hostname} from 'os';
import fs from 'fs';
import {spawn} from 'child_process';
import got from "got";
import {Logger, getLogger, LogLevel} from '@lib/misc/logger';

let logger = getLogger(null, 'CrawlWorker', LogLevel.info);

async function getConfig() {
  if (process.env.API_URL && process.env.API_KEY) {
    let full_url = process.env.API_URL + 'config' + '?API_KEY=' + process.env.API_KEY;
    logger.info('Obtaining config from url: ' + full_url);
    try {
      let response = await got(full_url, {
        timeout: 10000,
        json: true, // Automatically stringifies the body to JSON
        rejectUnauthorized: false,
      });
      return response.body;
    } catch(err) {
      console.error(err.message);
      return {};
    }
  }
  return {};
}

function initEnv() {
  if (process.argv.length === 3) {
    let path = process.argv[2];
    if (!fs.existsSync(path)) {
      logger.error('env path does not exist: ' + path);
      process.exit(1);
    } else {
      dotenv.config({ path: path });
    }
  }

  const required: Array<string> = ['API_KEY', 'API_URL', 'CHROME_VERSION', 'PUPPETEER_EXECUTABLE_PATH', 'EXECUTION_ENV'];

  for (let key of required) {
    if (process.env[key] === undefined) {
      logger.error(`ENV variable ${key} required. Aborting.`);
      process.exit(1);
    } else {
      logger.info(`ENV variable ${key}=${process.env[key]}`);
    }
  }
}

initEnv();

const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '0.0.0.0';

let outfile = fs.openSync('./Xvfb_out.log', 'a');

(async () => {
  // start a Xvfb server to simulate a graphical user interface on allocated servers
  let config: any = await getConfig();
  logger.verbose(`CrawlWorker[${hostname()}] config: ${JSON.stringify(config)}`);
  if (config.start_xvfb_server) {
    logger.info(`CrawlWorker[${hostname()}] Starting X virtual framebuffer using: xvfb_display=${config.xvfb_display}, xvfb_whd=${config.xvfb_whd}`);
    // Xvfb $DISPLAY -ac -screen 0 $XVFB_WHD -nolisten tcp &
    const args: Array<string> = [
      config.xvfb_display || ':99',
      '-ac',
      // -screen scrn WxHxD     set screen's width, height, depth
      '-screen',
      '0',
      config.xvfb_whd || '1280x720x16',
      '-nolisten',
      'tcp'
    ];
    let child = spawn('Xvfb', args, {
        detached: true,
    });

    child.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
    });

    child.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    if (child.pid) {
      logger.info(`CrawlWorker[${hostname()}] Xvfb pid: ${child.pid}`);
      fs.writeFileSync(outfile, 'pid=' + child.pid);
    }
  } else {
    logger.info(`CrawlWorker[${hostname()}] Not Starting X virtual framebuffer.`);
    // unset the USING_XVFB env variable
    // crawler will be launched with headless = false
    delete process.env.USING_XVFB;
  }

  let server = app.listen(PORT, () => {
    logger.info(`CrawlWorker[${hostname()}] with pid ${process.pid} listening on port ${PORT}`);
  });

  // https://github.com/expressjs/express/issues/3330
  // set server timeout to 12 hours
  let timeout: number = 12 * 60 * 60 * 1000;
  server.setTimeout(timeout);
  server.timeout = timeout;
})();
