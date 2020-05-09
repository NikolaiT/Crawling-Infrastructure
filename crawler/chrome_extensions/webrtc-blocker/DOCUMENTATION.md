## Documentation

### What do the settings mean and do?

**WebRTC IP handling policy (Chrome 48+)**

Setting | Effect 
--- | ---
`Use the default public interface only` | Send WebRTC traffic via the default public network adapter to the Internet. This will be the VPN adapter for system-VPN users.
`Use the default public interface and private interface` | Same as above, except allow WebRTC traffic through the default private interface to your local network as well.
`Disable non-proxied UDP (force proxy)` | Force the use of a proxy, and only allow WebRTC traffic over UDP proxies. This will effectively disable WebRTC communication for most users (depending on UDP proxy usage).

**Legacy options (Chrome 42 - 47)**

The legacy options are only displayed if you're using an older version of Chrome. 

`Prevent WebRTC from using routes other than the default route` is identical to `Use the default public interface only`, and `Prevent WebRTC from using non-proxied UDP` is identical to `Disable non-proxied UDP (force proxy)`.

**Older versions of Chrome (Chrome <42)**

WebRTC Leak Prevent is not compaitible with versions of Chrome below 42.

---
### I'm using a VPN or proxy, how do I prevent WebRTC leaks?

Seriously, how do I do this?

---
**I'm using a VPN that I installed software for, or configured in my operating system.**

In your case, the default settings should prevent leaks.

*WebRTC IP handling policy* is set to `Use the default public interface only` by default.

---
**I'm using a VPN in the form of a browser extension.**

These VPNs are considered proxies in Chrome.

Set *WebRTC IP handling policy* to `Disable non-proxied UDP (force proxy)`.

---
**I'm using the built-in VPN feature in Opera.**

Set *WebRTC IP handling policy* to `Disable non-proxied UDP (force proxy)`.

---
**I'm using a proxy.**

Set *WebRTC IP handling policy* to `Disable non-proxied UDP (force proxy)`.

---
**I'm not using a proxy or a VPN, but I want to conceal my local IP address.**

The default settings will prevent local leaks.

*WebRTC IP handling policy* is set to `Use the default public interface only` by default.

---
**I don't want to prevent leaks.**

Remove the extension.

---
**I don't know what leaks are.**

In this context leaks refer to the visibility of your personally identifiable IP address, even when using a VPN or proxy. For users with reasons to be concerned about privacy, such as Facebook users in China or anyone in the United States.

---
### How do I test for WebRTC leaks?

GitHub developer [diafygi](https://github.com/diafygi) has developed an [easy-to-use test](https://diafygi.github.io/webrtc-ips).

After you've set and applied a setting in WebRTC Leak Prevent, open or refresh diafygi's test to verify the effectiveness of the setting.

A WebRTC leak is occuring if you're using a VPN or proxy and your ISP-provided public IP address is visible in the test. You can use one of many tools [like this](http://whatismyipaddress.com/ip/8.8.8.8) to check an IP address.

---
### What is 'Incognito protection'?

<img src="https://i.imgur.com/1bHAIhy.png" width="60%">

By default, Chrome does not allow extensions to run in [Incognito mode](https://support.google.com/chrome/answer/95464). WebRTC Leak Prevent therefore cannot prevent WebRTC leaks in Incognito mode by default.

To enable Incognito protection check 'Allow in incognito' under WebRTC Leak Prevent in the Chrome Extension menu.

If you're okay with the extension not running in Incognito mode, or you explicitly don't want it to, you can ignore the warning message.
