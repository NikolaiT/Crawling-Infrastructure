## Todo


1) Check weather it is feasible to google by entering text in the browser bar directly. Reason: Saves us some http requests

=> Doesn't seem like it is possible with puppeteer.

2) Add option to download latest crawler on each request. [done]

3) I see that images are not loaded in the HTML

=> test in docker

4) prevent two concurrent requests [done]

test that we will get a 503 error when making two concurrent api calls for one api call


5) make 100 test crawls with region: us
Test how many fail (recaptcha)

5.1) make to google and to ipinfo. check that in both instances the same IP is shown
5.2) compute average time taken
5.3) show how many items failed

Problems: Number of total distinct ip addresses is only 24, despite
each api call having a own proxy.    


6) Detect google block way faster than via timeout [done]
detect that google shows recaptcha [done]

7) Why does proxy not work with google?

the function is not overwritten, thats way

when we set the proxy as static, it works well.

when restarting the proxy server, it never worked

8) local test shows that changing the proxy is working, however, online tests show that in 100 api calls,

- only 19/101 distinct ip are used with google
- 99/101 distinct ips are used with ipinfo

What is the reason? Is google serving cached pages? Is there some permanent ever cookie set that
google is using to set an ID?


=> Reset all browser data between api calls.

https://stackoverflow.com/questions/55871650/how-to-clear-history-clear-browsing-data-in-node-js-puppeteer-headless-false-c/

- Delete cookies.
- Delete user-data-dir

```
const client = await page.target().createCDPSession();
await client.send('Network.clearBrowserCookies');
await client.send('Network.clearBrowserCache');
```

=> make sure that WebRTC is blocked in chrome browsers  

https://github.com/VoidSec/WebRTC-Leak

https://ip.voidsec.com/

Implement a webrtc leak test with three different sites. [done]

Is webrtc detected if we don't use webrtc evasion?

## drawbacks of incognito mode

We have a median invocation time of 11.7 seconds. That's bad. The reason is probably
because all of Googles JS/Media files have to be requested freshly.

We only want to delete the cookies, not clearing the cache.

See: https://wp-rocket.me/blog/browser-cache-vs-cookies-difference/

Make following tests:

1) Delete cookies in page setup
2) Delete cookies and block media/css/image requests

With delete cookies:

```
Num Api Calls (N): 47
Api Calls succeeded: 45/47
Num disticnt ips (Google Serp): 45/45
Num Api calls recaptcha shown: 0/45
Num Api calls failed: 2/47
Average invocation time: 8.05 seconds
Median: 7.74 seconds
25% percentile: 4.738 seconds
75% percentile: 10.923 seconds
```

With delete cookies (101 calls):

```
Num Api Calls (N): 101
Api Calls succeeded: 93/101
Num disticnt ips (Google Serp): 92/93
Num Api calls recaptcha shown: 6/93
Num Api calls failed: 8/101
Average invocation time: 5.70 seconds
Median (50%): 4.003 seconds
25% percentile: 3.168 seconds
75% percentile: 7.696 seconds
```

With delete cookies (50 calls) and block ['image', 'stylesheet','media','font', 'imageset', 'texttrack', 'object',]

- test locally that types are really intercepted
- collect how many connections/http requests are made and aborted
- how much data is exchanged on all connections tx/tr

as https://github.com/puppeteer/puppeteer/blob/main/docs/api.md#pagesetrequestinterceptionvalue states:

NOTE: Enabling request interception disables page caching.

How to speedup response from GoogleScraper?

maybe dont wait for all network requests until they are done?

```
load - consider navigation to be finished when the load event is fired.
domcontentloaded - consider navigation to be finished when the DOMContentLoaded event is fired.
networkidle0 - consider navigation to be finished when there are no more than 0 network connections for at least 500 ms.
networkidle2 - consider navigation to be finished when there are no more than 2 network connections for at least 500 ms
```

important:

```
The load event is fired when the whole page has loaded, including all dependent resources such as stylesheets and images. This is in contrast to DOMContentLoaded, which is fired as soon as the page DOM has been loaded, without waiting for resources to finish loading.
```

When waiting for DOMContentLoaded we get the following results (US):

```
Num Api Calls (N): 101
Api Calls succeeded: 96/101
Num disticnt ips (Google Serp): 96/96
Num Api calls recaptcha shown: 4/96
Num Api calls failed: 5/101
Average invocation time: 4.16 seconds
Median (50%): 3.0965 seconds
25% percentile: 2.82025 seconds
75% percentile: 3.52575 seconds
```

And for the UK:

```
Num Api Calls (N): 101
Api Calls succeeded: 69/101
Num disticnt ips (Google Serp): 93
Num Api calls recaptcha shown: 29/101
Num Api calls failed: 2/101
Average invocation time: 3.35 seconds
Median (50%): 2.358 seconds
25% percentile: 2.258 seconds
75% percentile: 2.768 seconds
```
