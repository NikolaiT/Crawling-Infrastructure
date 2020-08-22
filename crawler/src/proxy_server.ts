const ProxyChain = require('proxy-chain');
import {Logger, getLogger, LogLevel} from '@lib/misc/logger';

let logger = getLogger(null, 'ProxyServer', LogLevel.info);

export function startProxyServer(proxy_state: any) {
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
      logger.verbose('proxy_state: ' + JSON.stringify(proxy_state));
      let upstream_proxy = null;
      if (proxy_state.proxy) {
        upstream_proxy = proxy_state.proxy;
      }
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
  });

  // Emitted when HTTP request fails
  server.on('requestFailed', (params: any) => {
    var {request, error} = params;
    logger.info(`Request ${request.url} failed`);
    logger.error(error);
  });

  return server;
}
