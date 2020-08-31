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
