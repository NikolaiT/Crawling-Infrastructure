import mongoose from 'mongoose';
import {WorkerType} from "./crawltask.model";

export enum MachineStatus {
  initial = 'initial',
  running = 'running',
  terminated = 'terminated',
  failed = 'failed'
}

export enum MachineType {
  http = 'http',
  browser = 'browser'
}

export interface IEip {
  eid: string;
  ip: string;
  used: boolean;
}

export interface IMachine {
  name: string;
  type: MachineType;
  status: MachineStatus;
  created: Date | null;
  terminated: Date | null;
  // machine meta data
  info: any;
  size: string;
  region: string;
  // elastic ip
  eip: IEip | null;
}

export interface IMachineDoc extends mongoose.Document {
  name: string;
  type: MachineType;
  status: MachineStatus;
  created: Date | null;
  terminated: Date | null;
  // machine meta data
  info: any;
  size: string;
  region: string;
  // elastic ip
  eip: IEip | null;
}

const MachineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: MachineType,
    required: false,
  },
  status: {
    type: MachineStatus,
    required: true,
  },
  created: {
    type: Date,
    required: false,
  },
  terminated: {
    type: Date,
    required: false,
  },
  info: {
    type: Object,
    required: false,
  },
  size: {
    type: String,
    required: false,
  },
  region: {
    type: String,
    required: false,
  },
  eip: {
    type: Object,
    required: false,
  }
});

export class MachineHandler {
  machine_model: any;

  constructor() {
    const Db = mongoose.connection.useDb('CrawlMaster');
    this.machine_model = Db.model<IMachineDoc>('machines', MachineSchema);
  }

  public async create(machine: IMachine): Promise<IMachineDoc> {
    return await this.machine_model.create(machine);
  }

  /**
   * Drop the machine collection.
   */
  public async drop() {
    await this.machine_model.collection.drop();
  }

  /**
   * Get all active machines.
   *
   * @param filter: additional filter
   */
  public async getMachines(filter: any = null): Promise<Array<IMachineDoc>> {
    // get only those machines that are running and
    // that have an allocated elastic ip
    let default_filter: any = {
      status: MachineStatus.running,
      eip: {$ne: null}
    };

    if (filter) {
      Object.assign(default_filter, filter);
    }

    return await this.machine_model.find(default_filter);
  }

  /**
   * Get endpoints of all the crawlers.
   *
   * Get only machine endpoints for tasks with matching worker types.
   *
   * Tasks that need a browser will be assigned to crawler machines
   * with support for browser. Http tasks will be assigned to http machines.
   */
  public async getApiEndpoints(worker_type: WorkerType): Promise<Array<string>> {
    let machines = await this.getMachines({
      type: (worker_type === WorkerType.http) ? MachineType.http : MachineType.browser,
    });

    let endpoints = [];

    for (let machine of machines) {
      if (machine.type === MachineType.browser) {
        endpoints.push(`http://${machine.eip.ip}:3333`);
      } else {
        endpoints.push(`http://${machine.eip.ip}:4444`);
      }
    }
    return endpoints;
  }

  public async getNumRunningMachines(type: MachineType | null = null) {
    let filter: any = {
      status: MachineStatus.running,
      eip: {$ne: null}
    };

    if (type) {
      filter.type = type;
    }

    return await this.machine_model.find({
      status: MachineStatus.running,
      eip: {$ne: null}
    }).count();
  }

  public async getAll(filter: any = {}, select: any = {}) {
    return await this.machine_model.find(filter).select(select).lean();
  }
}

export interface IMachineModel extends mongoose.Model<IMachineDoc> { }
