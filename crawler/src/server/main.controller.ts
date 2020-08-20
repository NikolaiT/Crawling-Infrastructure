import {Application} from 'express';
import {WorkerService} from './worker.service';
import {auth} from './middleware/auth';

export class Controller {
  private worker_service: WorkerService;

  constructor(private app: Application) {
    this.worker_service = new WorkerService();
    this.routes();
  }

  public routes() {
    this.app.route('/').get(this.worker_service.hello.bind(this.worker_service));
    this.app.route('/invokeEvent').post(auth, this.worker_service.invokeEvent.bind(this.worker_service));
    this.app.route('/invokeRequestResponse').post(auth, this.worker_service.invokeRequestResponse.bind(this.worker_service));
    this.app.route('/blankSlate').post(auth, this.worker_service.blankSlate.bind(this.worker_service));
  }
}
