import app from "./app";
import * as dotenv from "dotenv";
import {hostname} from 'os';

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

let server = app.listen(PORT, () => {
  console.log(`CrawlWorker[${hostname()}] with pid ${process.pid} listening on port ${PORT}`);
});

// https://github.com/expressjs/express/issues/3330
// set server timeout to 1 hour
let timeout: number = 60 * 60 * 1000;
server.setTimeout(timeout);
server.timeout = timeout;