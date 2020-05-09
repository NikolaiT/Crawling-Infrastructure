import {Logger, getLogger} from '@lib/misc/logger';
import {Request, Response} from "express";
import {system} from "@lib/misc/shell";

export class InfraService {
  logger: Logger;

  constructor() {
    this.logger = getLogger(null, 'infra_service');
  }

  public async getSchedulerLogs(req: Request, res: Response) {
    try {
      let logs = await system('docker service logs CrawlMaster_scheduler --tail 150 --no-task-ids');
      res.json({logs: logs.stdout});
    } catch (err) {
      res.status(400).send({error: err.toString()});
    }
  }
}