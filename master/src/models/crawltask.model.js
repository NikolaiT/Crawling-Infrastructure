"use strict";
exports.__esModule = true;
var mongoose_1 = require("mongoose");
/**
 * See example mongoose schema:
 * https://gist.github.com/brennanMKE/ee8ea002d305d4539ef6
 */
var InvocationType;
(function (InvocationType) {
  InvocationType[InvocationType["request_response"] = 0] = "request_response";
  InvocationType[InvocationType["event"] = 1] = "event";
})(InvocationType = exports.InvocationType || (exports.InvocationType = {}));
var WorkerType;
(function (WorkerType) {
  WorkerType[WorkerType["http"] = 0] = "http";
  WorkerType[WorkerType["browser"] = 1] = "browser";
})(WorkerType = exports.WorkerType || (exports.WorkerType = {}));
var CrawlStatus;
(function (CrawlStatus) {
  CrawlStatus[CrawlStatus["started"] = 0] = "started";
  CrawlStatus[CrawlStatus["completed"] = 1] = "completed";
  CrawlStatus[CrawlStatus["failed"] = 2] = "failed";
})(CrawlStatus = exports.CrawlStatus || (exports.CrawlStatus = {}));
var CrawlTaskSchema = new mongoose_1["default"].Schema({
    unique_id: {
      type: String,
      required: false
    },
    status: {
      type: CrawlStatus,
      required: true,
      "default": CrawlStatus.started
    },
    invocation_type: {
      type: InvocationType,
      required: true,
      "default": InvocationType.event
    },
    worker_type: {
      type: WorkerType,
      required: true
    },
    // how many crawlers were created in total for this task
    crawl_worker_counter: {
      type: Number,
      "default": 0
    },
    // keeps track how many workers are currently running
    num_workers_running: {
      type: Number,
      "default": 0
    },
    items_url: {
      type: String,
      required: false
    },
    "function": {
      type: String,
      required: true
    },
    function_code: {
      type: String,
      required: true
    },
    queue: {
      type: String,
      required: false
    },
    num_items: {
      type: Number,
      required: false
    },
    num_items_crawled: {
      type: Number,
      required: false
    },
    region: {
      type: String,
      required: true
    },
    priority: {
      type: Number,
      required: true,
      "default": 1
    },
    max_request_per_second: {
      type: Number,
      required: false
    },
    avg_request_per_second_worker: {
      type: Number,
      required: false
    }
  },
// https://stackoverflow.com/questions/12669615/add-created-at-and-updated-at-fields-to-mongoose-schemas
  {
    timestamps: {createdAt: 'createdAt', updatedAt: 'updatedAt'}
  });
CrawlTaskSchema.methods.maxWorkersConcurrentlyRunning = function () {
  // compute the numbers of workers required to
  // achieve the max_request_per_second crawling speed
  // there was not lambda function started yet,
  // so we don't have any average crawling speed data
  // per worker
  var num_workers = 0;
  if (this.avg_request_per_second_worker === null) {
    // assume that one worker achieves the following
    // speeds
    var crawling_speed_heuristic = {
      http: 0.5,
      browser: 0.2
    };
    this.avg_request_per_second_worker = crawling_speed_heuristic[this.worker_type];
  }
  // Math.floor because we rather don't overshoot the max request per second
  num_workers = Math.floor(this.max_request_per_second / this.avg_request_per_second_worker);
  return num_workers;
};
CrawlTaskSchema.methods.numWorkersAlreadyRunning = function () {
  return this.num_workers_running;
};
//Creating our model
exports.CrawlTask = mongoose_1["default"].model("CrawlTask", CrawlTaskSchema);
