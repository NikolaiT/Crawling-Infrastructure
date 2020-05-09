import express, {Application} from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import {Controller} from './main.controller';
import compression from 'compression';

class App {
  public app: Application;
  public controller: Controller;

  constructor() {
    this.app = express();
    this.setConfig();

    //Creating and assigning a new instance of our controller
    this.controller = new Controller(this.app);
  }

  // Add middleware/settings/routes to express.
  private setConfig() {
    //Allows us to receive requests with data in json format
    this.app.use(bodyParser.json({limit: '50mb'}));

    //Allows us to receive requests with data in x-www-form-urlencoded format
    this.app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

    //Enables cors
    this.app.use(cors());

    //Enable static files
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Enable compression
    // compress all responses
    this.app.use(compression());

    // @todo: check API credentials and required keys here

    // prettify json
    this.app.set('json spaces', 2);
  }
}

export default new App().app;