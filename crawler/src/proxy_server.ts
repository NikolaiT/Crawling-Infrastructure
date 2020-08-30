const ProxyChain = require('proxy-chain');
import {Logger, getLogger, LogLevel} from '@lib/misc/logger';

let logger = getLogger(null, 'ProxyServer', LogLevel.info);

export async function startProxyServer() {
  return new Promise(function(resolve, reject) {
    const server = new ProxyChain.Server({
      // Port where the server will listen. By default 8000.
      port: 8000,
      // Enables verbose logging
      verbose: false,
      prepareRequestFunction: function (params: any) {
        var {request, username, password, hostname, port, isHttp, connectionId} = params;
        logger.verbose('isHttp: ' + isHttp);
        logger.verbose('port: ' + port);
        logger.verbose('hostname: ' + hostname);
        logger.verbose('headers: ' + JSON.stringify(request.headers));
        return {
          requestAuthentication: false,
          upstreamProxyUrl: null,
        };
      },
    });

    // Emitted when HTTP connection is closed
    server.on('connectionClosed', (params: any) => {
      var {connectionId, stats} = params;
      logger.verbose(`Connection ${connectionId} closed`);
    });

    // Emitted when HTTP request fails
    server.on('requestFailed', (params: any) => {
      var {request, error} = params;
      logger.error(`Request ${request.url} failed`);
      logger.error(error);
    });

    server.listen(() => {
      logger.info(`Listening on port ${server.port}`);
      resolve(server);
    });
  });
}
