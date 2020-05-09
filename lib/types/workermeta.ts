import mongoose from "mongoose";

export enum WorkerStatus {started, completed, lost}

export interface IWorkerMeta extends mongoose.Document {
  status: WorkerStatus,
  worker_id: number;
  started: Date;
  ended: Date,
  average_items_per_second: number;
  num_items_crawled: number;
  num_items_failed: number;
  bytes_uploaded: number;
  region: string;
  ip: string;
  worker_status: string;
  items_browser_debug: Array<string>;
}

export const WorkerMetaSchema = new mongoose.Schema({
  status: {
    type: WorkerStatus,
    required: true,
    default: WorkerStatus.started,
  },
  worker_id: {
    type: Number,
    required: true,
    unique: false,
  },
  started: {
    type: Date,
    default: null,
  },
  ended: {
    type: Date,
    default: null,
  },
  average_items_per_second: {
    type: Number,
    default: null,
  },
  // the number of items that the worker
  // attempted to crawl (including failed ones)
  num_items_crawled: {
    type: Number,
    default: null,
  },
  // the number of items that
  // failed to be crawled
  num_items_failed: {
    type: Number,
    default: null,
  },
  // the number of bytes uploaded
  // by the worker
  bytes_uploaded: {
    type: Number,
    default: null,
  },
  region: {
    type: String,
    default: '',
  },
  ip: {
    type: String,
    required: false,
  },
  worker_status: {
    type: String,
    required: false,
  },
  items_browser_debug: {
    type: [String],
    required: false,
  }
});