import zlib from "zlib";
const got = require('got');


/**
 * Download a file over http.
 *
 * If the url ands with `.gz`/`.gzip`, try to gunzip it and
 * return the inflated text.
 */
export function downloadMaybeGzipped(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let is_gzipped = url.endsWith('.gz') || url.endsWith('.gzip');

    let options: any = {
      timeout: 20000,
      decompress: true,
    };

    // Encoding to be used on setEncoding of the response data.
    // If null, the body is returned as a Buffer (binary data).
    if (is_gzipped) {
      options['encoding'] = null;
    }

    got(url, options).then((response: any) => {
      console.log(`Loaded crawler code from url: ${response.body.length} bytes from ${url}`);
      if (is_gzipped) {
        zlib.gunzip(response.body, function (err, deflated) {
          if (err) {
            console.error(err.toString());
            reject(err);
          }
          if (deflated === undefined) {
            reject('Could not deflate response.body');
          }
          let text = deflated.toString();
          resolve(text);
        });
      } else {
        resolve(response.body);
      }
    }).catch((err: any) => {
      reject(err);
    });
  });
}
