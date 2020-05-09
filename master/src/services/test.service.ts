import {Logger, getLogger} from '@lib/misc/logger';
import {Request, Response} from "express";
import path from "path";

export class TestService {
  logger: Logger;

  constructor() {
    this.logger = getLogger(null, 'test_service');
  }

  public static async ip(req: Request, res: Response) {
    res.json({
      ip: req.ip
    });
  }

  public static async headers(req: Request, res: Response) {
    res.json({
      headers: req.headers
    });
  }

  /**
   * We use that library: https://github.com/Valve/fingerprintjs2
   *
   * in order to get an fingerprint.
   * @param req
   * @param res
   */
  public static async fingerprint(req: Request, res: Response) {
    let appRoot = require('app-root-path');
    // let path_to_file = path.join(__dirname, './fingerprint.html');
    // res.sendFile(path_to_file);

    // @todo: thats awful, but sending a file is fucking annoying me when I have
    // @todo to deal with docker/typescript all mixing up paths
    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Fingerprint2.js</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/fingerprintjs2/2.1.0/fingerprint2.min.js"></script>
</head>
<body>

<pre id="fingerprint"></pre>

<script>
  function handler(components) {
    var result = {};
    for (var i = 0; i < components.length; i++) {
      result[components[i].key] = components[i].value;
    }
    var values = components.map(function (component) { return component.value })
    var murmur = Fingerprint2.x64hash128(values.join(''), 31)
    result.hash = murmur;
    document.getElementById('fingerprint').innerText = JSON.stringify(result);
  }

  if (window.requestIdleCallback) {
    requestIdleCallback(function () {
      Fingerprint2.get(handler)
    })
  } else {
    setTimeout(function () {
      Fingerprint2.get(handler)
    }, 500)
  }
</script>

</body>
</html>`;

    res.header('Content-Type', 'text/html');
    res.send(html);
  }
}