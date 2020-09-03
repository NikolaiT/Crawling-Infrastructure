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
