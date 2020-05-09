import express, {Application} from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import path from 'path';
import {Controller} from './main.controller';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import * as swaggerDocument from './swagger.json';
import {mongoConnect} from './db/db';

export class App {
  public app: Application;
  public controller: Controller;

  constructor() {
    this.app = express();
    this.setConfig();
  }

  public async start() {
    // connect to mongodb
    await mongoConnect();

    //Creating and assigning a new instance of our controller
    this.controller = new Controller(this.app);

    await this.controller.setup();

    // show swagger documentation
    this.app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  }

  // Add middleware/settings/routes to express.
  private setConfig() {
    //Allows us to receive requests with data in json format
    this.app.use(bodyParser.json({limit: '50mb'}));

    //Allows us to receive requests with data in x-www-form-urlencoded format
    this.app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

    //Enables cors
    this.app.use(cors());

    //Enable logging
    this.app.use(logger('dev'));

    this.app.use(cookieParser());

    //Enable static files
    this.app.use(express.static(path.join(__dirname, 'public')));

    // Enable compression
    // compress all responses
    this.app.use(compression());

    // prettify json
    this.app.set('json spaces', 2);
  }
}