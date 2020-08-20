const ProxyChain = require('proxy-chain');

export function startProxyServer() {
  const server = new ProxyChain.Server({
    // Port where the server will listen. By default 8000.
    port: 8000,
    // Enables verbose logging
    verbose: true,
    prepareRequestFunction: (params: any) => {
      var {request, username, password, hostname, port, isHttp, connectionId} = params;
      console.log(request.headers);
      let upstream_proxy = request.headers['x-no-forward-upstream-proxy'] || null;
      console.log('Using upstream proxy: ' + upstream_proxy);
      return {
        requestAuthentication: false,
        upstreamProxyUrl: upstream_proxy,
      };
    },
  });

  server.listen(() => {
    console.log(`ProxyServer is listening on port ${server.port}`);
  });

  // Emitted when HTTP connection is closed
  server.on('connectionClosed', (connectionId: any, stats: any) => {
    console.log(`Connection ${connectionId} closed`);
    console.dir(stats);
  });

  // Emitted when HTTP request fails
  server.on('requestFailed', (request: any, error: any) => {
    console.log(`Request ${request.url} failed`);
    console.error(error);
  });

  return server;
}
