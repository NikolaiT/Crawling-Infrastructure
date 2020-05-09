import mongoose from 'mongoose';

export interface Item {
  _id: string;
  item: string;
  crawled: Date | null;
  status: QueueItemStatus;
  retries: number;
  error: string;
  region: string;
}

export enum QueueItemStatus { initial, running, completed, failed }

export interface IQueue extends mongoose.Document {
  item: string;
  crawled: Date | null;
  status: QueueItemStatus;
  retries: number;
  error: string;
  region: string;
}

export interface IQueueStats {
  initial: number;
  running: number;
  completed: number;
  failed: number;
}

export const CrawlTaskQueueSchema = new mongoose.Schema({
  item: {
    type: String,
    required: true,
  },
  crawled: {
    type: Date,
    required: false,
  },
  status: {
    type: QueueItemStatus,
    required: true,
    default: QueueItemStatus.initial,
    index: true,
  },
  retries: {
    type: Number,
    default: 0,
    required: true,
  },
  error: {
    type: String,
    default: '',
    required: false,
  },
  region: {
    type: String,
    default: '',
    required: false,
  }
});