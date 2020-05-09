import {Logger, getLogger} from '@lib/misc/logger';
import {Request, Response} from "express";
import {ProxyHandler} from "../models/proxy.model";

export class ProxyService {
  logger: Logger;
  proxy_handler: ProxyHandler;

  constructor() {
    this.logger = getLogger(null, 'proxy_service');
    this.proxy_handler = new ProxyHandler();
  }

  public getAllProxies(req: Request, res: Response) {
    let filter = req.body.filter || {};
    let sort = req.body.sort || {last_used: -1, proxy_fail_counter: 1, block_counter: 1};
    this.logger.info(`Using filter: ${JSON.stringify(filter)}`);
    this.proxy_handler.getAll(filter, sort).then((all) => {
      res.json(all);
    }).catch((err) => {
      res.status(404).send({error: err.toString()});
    });
  }

  public listProxies(req: Request, res: Response) {
    let sort = {last_used: -1, obtain_counter: 1};
    this.proxy_handler.getAll({}, sort).then((all) => {
      res.json(all);
    }).catch((err) => {
      res.status(404).send({error: err.toString()});
    });
  }

  public async updateAllProxies(req: Request, res: Response) {
    let criteria = req.body.criteria || {};
    let update = req.body.update || null;

    if (!update) {
      res.status(400).send({error: 'update object cannot be empty.'});
    } else {
      try {
        let update_info = await this.proxy_handler.update(criteria, update);
        res.json(update_info);
      } catch (err) {
        res.status(400).send({error: err.toString()});
      }
    }
  }

  public async reloadProxies(req: Request, res: Response) {
    try {
      await this.proxy_handler.drop();
      await this.proxy_handler.loadProxies();
      res.json({ message: 'Reloaded all proxies' });
    } catch (err) {
      res.status(400).send({error: err.toString()});
    }
  }
}