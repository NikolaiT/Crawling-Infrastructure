# Crawling Infrastructure Introduction

All commands are issued in the `crawling_infrastructure` root directory:

```bash
$ ls
COPYING  crawler  Howto.md  lib  master  Readme.md  scripts
```

Activate environment:

```bash
$ source crawl_master/env/.env
```

Show statistical information about tasks in the system:

```bash
curl -k "$API_URL"stats?API_KEY="$API_KEY"
```

The above url resolves to 

```bash
curl -k http://:9001/stats?simple=true&API_KEY=kfTP6E7GgDTtIBZnUQq4skrHGWcuPe1Z
```

Print all proxies currently loaded in the system. This will yield a collection
of 2000 or more proxies, so please expect a lot of output.

```bash
curl -k "$API_URL"proxies?API_KEY="$API_KEY"
```

## Api Documentation

You can learn how the API is used by visiting the swagger Api documentation with your browser at

```bash
echo -k "$API_URL"swagger/
```

Currently, API documentation can be found here: http://:9001/swagger/

## Crawl Task creation

In the very least, you need to define two entities to create a crawl task:

1. An array of items. Currently items are defined in text files separated by newlines.
2. A javascript class that defines the behavior of your crawler.

Example for item file:

```text
https://google.com
https://bing.com
https://amazon.com
```

Then you need to define the crawler. A simple crawler that renders a url with a browser and refreshes a whitelisted proxy on every request would look like this:

```js
class RenderProxy extends BrowserWorker {
  async crawl(url) {
    await this.get_proxy(
      {
        filter: { whitelisted: true },
        change: 1, // change proxy on failure or every 1th item
      });

    await this.page.goto(url, {
      waitUntil: 'networkidle2', // wait until there are maximally 2 connections left
    });

    return await this.page.content();
  }
}
```

If you want to create a crawler that changes the proxy only on every 8th request (but always on proxy failure), you could create a crawler such as listed below. The crawler also removes all `<script>, <style>` tags from the document. Additionally, `rotating` proxies are excluded.

```js
class RenderProxyLean extends BrowserWorker {
  async crawl(url) {
    await this.get_proxy(
      {
        filter: { whitelisted: true, rotating: false }, // only proxies that are whitelisted
        change: 8, // change proxy on failure or every nth item
      });

    await this.page.goto(url, {
      waitUntil: 'networkidle2', // wait until there are maximally 2 connections left
      timeout: 30000, // don't wait forever, it's better to fail than to consume too much resources
    });

    return await this.clean_html({
      tags: ['script', 'style']
    });
  }
}
```

So the above configuration will create a task that visits those three urls with the above defined crawler and stores the result in aws s3.

Because passing the item file as string becomes quickly a size problem, you can pass 
a url that points to the item file. This item file can be gzip compressed to reduce size.

The api call to create the task looks like this. Please replace `{{API_KEY}}` with the correct value.

```bash
curl -k  $API_URL/task/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}",
       "whitelisted_proxies": true,
       "items": "https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/items/top100.txt",
       "function": "https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/render_lean.js",
       "crawl_options": {
          "default_navigation_timeout": 60000,
          "request_timeout": 20000,
          "apply_evasion": true,
          "random_user_agent": false
       },
       "max_items_per_second": 1.0 }'
```

This api call will load the top 100 websites as items and use the crawler defined above.

Some important variables:

1. `whitelisted_proxies` - set this to `true` if you want to use whitelisted proxies. Using whitelisted proxies is currently only possible by launching aws ec2 instances with an elastic ip. So if you set this to `true`, the aws lambda backend will not be used, instead ec2 machines are allocated. This usually takes some setup time, so don't wonder when crawling will start around 2 minutes after creation.

2. `max_items_per_second` - This defines how fast the items will be crawled. By default set to `1`. Simple Rule: When crawling a single site, don't make this larger than 1 to 2. When crawling different sites, you may increase the speed.

3. `crawl_options` - You may define crawling options that are passed to the crawlers.

After you created the task, you can show the state of the system by issuing again:

```bash
curl -k "$API_URL"stats?API_KEY="$API_KEY"
```

After the task was finished, you can get the aws s3 locations of the results by issuing the command below.
 
The task `id` can be learned by inspecting the outputs of `curl "$API_URL"stats?API_KEY="$API_KEY"`.

```bash
curl -k "$(echo $API_URL)storage/{{id}}?how=cmd&API_KEY=$(echo $API_KEY)"
```

so for example:

```bash
curl -k "$(echo $API_URL)storage/5dfba383588d2a00078bcce6?how=cmd&API_KEY=$(echo $API_KEY)"
```

Then you can download & process the results and continue to analyze them or postprocess.

### Using crawling profiles

There are several crawling profiles predefined in the crawling infrastructure.

1. `cloudflare` - Sets various options in order to bypass cloudflare anti-bot protection
2. `curl` 

The `cloudflare` option sets the following `crawl_options`:

```
crawl_task.can_use_proxies = true;
crawl_task.whitelisted_proxies = true;
crawl_task.crawl_options = {
    default_navigation_timeout: 60000,
    apply_evasion: true,
    random_user_agent: true,
    random_user_data_dir: true,
    block_webrtc: true,
}
```

So instead of providing those options manually upton crawl task creation, you can simply pass `profile: 'cloudflare'`

```bash
curl -k $API_URL/task/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}",
       "items": "https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/items/top100.txt",
       "function": "https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/render_lean.js",
       "profile": "cloudflare",
       "max_items_per_second": 1.0 }'
```

## Proxy management in crawlers

You can define from within you crawling code when and how to switch proxies by invoking `this.get_proxy(options)`.

```js
class RenderProxy extends BrowserWorker {
  async crawl(url) {
    
    // this will get a fresh proxy that was least recently used
    // and is whitelisted. A new proxy will be requested on every
    // 5th request or on proxy failure
    await this.get_proxy(
      {
        filter: { whitelisted: true },
        change: 5, // change proxy on failure or every 1th item
      });
    
    // this sets the currently used proxy to `blocked` and 
    // obtains a fresh proxy. This makes sense if you want to
    // react to a proxy scenario from within you crawler code
    await this.get_proxy(
      {
        reason: 'blocked'
      });
  }
}
```

## Managing tasks


### Pause all tasks

In order to pause all tasks, use:

```bash
curl -k $API_URL/pause_tasks/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}" }'
```

### Resume all tasks

You can resume all tasks by calling the endpoint

```bash
curl -k $API_URL/resume_tasks/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}" }'
```


When the task is running, there might be several issues that arise. For example, you need to check that the results produced by the task are of the expected quality.

### Get items from the queue

#### Get all items

```bash
curl $API_URL/items/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}",
       "id": "{{TASK_ID}}" }'
```

#### Get failed items

```bash
curl -k $API_URL/items/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}",
       "failed": true,
       "id": "{{TASK_ID}}" }'
```

### Enqueue failed items back to state `initial`

When your task exceeds the max retries for each item and they are still failed, you might
want to manually enqueue the failed items.

Before that, you need to **pause the task**. See above, how to do that.

You can enqueue failed items with the following endpoint:

```bash
curl -k $API_URL/heal_queue/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}",
       "what": "failed"
       "id": "{{TASK_ID}}" }'
```

and you can enqueue running items with the following endpoint:

**this should only be done when you understand while they are still running**

```bash
curl -k $API_URL/heal_queue/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}",
       "what": "running"
       "id": "{{TASK_ID}}" }'
```

### Obtaining a results sample of the most recent results

In order to receive results of the 5 most recent items, you can curl this endpoint:

```bash
curl -k "$API_URL"results/{{TASK_ID}}?sample_size=5&recent=1&API_KEY="$API_KEY"
```

or with env variables resolved:

```bash
curl -k http://:9001/results/{{TASK_ID}}?sample_size=1&recent=1&API_KEY=kfTP6E7GgDTtIBZnUQq4skrHGWcuPe1Z
```

`sample_size` determines how many results you want to download

if `recent` is set to 1, the most recent results are downloaded.

Example: 

```bash
curl -k http://:9001/results/5e065576315006000707a39a?sample_size=20&recent=1&API_KEY=kfTP6E7GgDTtIBZnUQq4skrHGWcuPe1Z
```

### Finding the s3 urls of the task results

You can get the s3 locations / urls of the task by invoking:

```bash
curl -k "$API_URL"storage/{{TASK_ID}}?how=flat&API_KEY="$API_KEY"
```

Example: 

```bash
curl -k http://:9001/storage/5e10de0161236700074097a8?how=flat&API_KEY=kfTP6E7GgDTtIBZnUQq4skrHGWcuPe1Z
```

### Obtaining a command how to download the task results

You can get a script that downloads task results by invoking the following url

```bash
curl "$API_URL"storage/{{TASK_ID}}?how=cmd&API_KEY="$API_KEY"
```

Example: 

```bash
curl http://:9001/storage/5e10de0161236700074097a8?how=cmd&API_KEY=kfTP6E7GgDTtIBZnUQq4skrHGWcuPe1Z
```

###  Enqueuing items into existing tasks

Sometimes targets (websites that are crawled) are behaving unexpectedly and for that reason invalid data is stored in the cloud. For that reason it's necessary to enqueue items based on their crawling result that is stored in the cloud.

##### Example 

For example a cloudflare protected website blocks and the task doesn't handle this error. For that reason the task results need to be enumerated and each html blob needs to be checked for certain needles that indicate cloudflare anti bot blocking.

This is possible by calling the following api endpoint:

```bash
curl -k $API_URL/enqueue/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}",
       "function": "some function string",
       "id": "{{TASK_ID}}",
       "dryrun": "true" }'
```

You can prepare the post request like that:

```javascript
let check_function = function check(item_id, result) {
    if (result.includes('Pardon Our Interruption') || result.includes('your browser made us think you were a bot')) {
      return true;
    }
    return false;
};

let function_string = check_function.toString();

let post_payload = {
  "API_KEY": "{{API_KEY}}",
  "function": function_string,
  "id": "{{TASK_ID}}",
  "dryrun": "true" // set to "false" if you want to update items in queue
};

// send post request with above post_payload
```

The function `check` has the function signature `check(item_id, result)` and must return `true` if the 
item with id `item_id` should be enqueued again. `result` contains that data that was stored when `crawl()` finished.

Set `dryrun` to `"false"` in order to enqueue failed items in the db. Otherwise, items will only be tested and returned.

**Caution: ** This function downloads all items from the s3 cloud to the master server and thus takes significant time if the task is large!


## Managing the crawling infrastructure

### Modifying and restarting the master server

The master consists of two parts:

1. The REST Api
2. The Scheduler

If there are aws ec2 machines allocated and we restart the `scheduler`, the `docker-machine` state of those machines is lost and it's impossible to turn them down automatically.

For that reason, before restarting the scheduler, we need to **pause all running tasks** with the command

```bash
curl -k $API_URL/pause_tasks/ \
  -H "Content-Type: application/json" \
  -d '{"API_KEY": "{{API_KEY}}" }'
```





