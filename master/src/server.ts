import 'module-alias/register';
import {App} from "./app";
import https from 'https';
import fs from 'fs';

(async () => {
  const PORT = process.env.PORT || 9001;

  const handler = new App();
  await handler.start();

  const server = https.createServer({
    key: fs.readFileSync('certs/server.key'),
    cert: fs.readFileSync('certs/server.cert'),
  }, handler.app)
    .listen(PORT, function () {
      console.log(`Master Api listening on port ${PORT}`);
    });

  server.setTimeout(5000000);
})();
