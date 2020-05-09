## Queueing architecture

### Guarantee failure resistance

There are a couple of scenarios that could put the queue into a inconsistent state.

### What I do

Currently I store the rps values from each worker in a array. that way we compute the average rps
and schedule new worker invocations

But what happens when for some reason workers **die** or **time out** and are unable to update the meta data???

```typescript
let update: any = {
$inc: {'num_workers_running': -1, 'crawl_worker_counter': 1, 'num_items_crawled': meta.num_items_crawled},
};
```

the following happens:

`task.num_workers_running` is larger than it should be and is never decreased because meta data was not updated by lambda function. 

items remain in state `running` and are never completed.

That way some items are not processed, the task stays incomplete.

## Failure detection

Maybe implementing a very basic failure detection mechanism will prevent most serious problems.

The scheduler creates the following metadata object in the mongodb for each worker when started: 

```json
{
  "worker_id": 34,
  "started": "34534534",
  "ended": null,
  "average_rps": null,
  "num_items_crawled": null,
  "region": ""
}
```

For implementation, check that out: https://itnext.io/typescripting-mongoose-models-d2e2e82605df

Right now, it is just implemented as array in the task (subdocument).

When the started lambda worker fails to update the data `ended` and `average_rps` after more than X minutes (probably 6 minutes, because lambda instances can run for maximally 5 minutes), the the scheduler knows that the lambda worker somehow got lost.

Then we can manually decrease `task.num_workers_running` for each failed instance and print an error message to inform the user. When more than X such failures occur, the task is deemed to be unhealhy and is stopped. Use a ratio `max_lost_workers_ratio = lost_workers / total_workers` that determines when to stop.

When the metadata object was successfully updated and we know that the lambda instance was successful, we drop the metadata element again. (implement as routine cleanup operation, just clean everything that is older than X minutes).

### Is there a other way to detect failures instead of creating more metadata for each invocation?

The only sensible way to recognize failure is to check that the lambda worker didn't update its metadata after X minutes passed. The update operation is at the end of the lambda function, therefore the middle part must have been executed.


### Worker Metadata implementation

don't use subdocuments in the crawl task
It's bad, because many concurrent workers will update many times the same element (task)

Better to use a dedicated metadata database with one collection for each crawl task. (similar as the queue).

Decrease the counters when the metadata was updated, when not, a worker loss is detected.

Never actually access the crawl task from the workers, only the queue and the metadata.

## Prevent inconsistencies

#### Prevent timeouts in worker code. Use

```javascript
context.getRemainingTimeInMillis()
```

The function should have enough time to update the queue state and to store to AWS. So lets say 30 seconds.

[done]

#### Only increase task.num_workers_running when lambda invocations were successful

Only increase the counter when the lambda api call was successful. Also increase when the lambda function was started, but the function failed for some reason.

this means increasing when status == 202. 

[done]

#### Always update the meta data on lambda workers when function fails

use `finally` construct so that the meta data is always updated regardless of error.


#### (Maybe) store data as soon as it was scraped.

We need to have a functionality that stores data in s3 as soon as it was crawled. 

But maybe this will result in too many requests to s3 and thus increased costs.