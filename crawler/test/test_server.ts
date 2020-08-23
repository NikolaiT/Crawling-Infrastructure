import express from "express";
import path from "path";
const app = express();
const port = 8888;

export function launchTestServer() {
  // define a route handler for the default home page
  app.get( "/headers", ( req, res ) => {
      // render the index template
      res.json( req.headers );
  } );

  // start the express server
  let server = app.listen( port, '0.0.0.0', () => {
      // tslint:disable-next-line:no-console
      console.log( `test server started on port ${port}` );
  } );

  return server;
}
