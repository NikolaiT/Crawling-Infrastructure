const ProxyChain = require('proxy-chain');
import {Logger, getLogger, LogLevel} from '@lib/misc/logger';

let logger = getLogger(null, 'ProxyServer', LogLevel.info);

export function startProxyServer() {
  const server = new ProxyChain.Server({
    // Port where the server will listen. By default 8000.
    port: 8000,
    // Enables verbose logging
    verbose: true,
    prepareRequestFunction: (params: any) => {
      var {request, username, password, hostname, port, isHttp, connectionId} = params;
      logger.verbose(request.headers);
      let upstream_proxy = request.headers['x-no-forward-upstream-proxy'] || null;
      logger.info('Using upstream proxy: ' + upstream_proxy);
      return {
        requestAuthentication: false,
        upstreamProxyUrl: upstream_proxy,
      };
    },
  });

  server.listen(() => {
    logger.info(`Listening on port ${server.port}`);
  });

  // Emitted when HTTP connection is closed
  server.on('connectionClosed', (params: any) => {
    var {connectionId, stats} = params;
    logger.info(`Connection ${connectionId} closed`);
    logger.verbose(stats);
  });

  // Emitted when HTTP request fails
  server.on('requestFailed', (params: any) => {
    var {request, error} = params;
    logger.info(`Request ${request.url} failed`);
    logger.error(error);
  });

  return server;
}
