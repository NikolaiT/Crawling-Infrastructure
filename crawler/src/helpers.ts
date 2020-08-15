import {supported_screen_sizes} from './config';
const tunnel = require('tunnel');
const UserAgent = require('user-agents');

export function getProxyAgent(proxy: any) {
  let proxy_obj: any = {};

  if (proxy.proxy.indexOf(':') != -1) {
    let [host, port] = proxy.proxy.split(':');
    proxy_obj.host = host;
    proxy_obj.port = parseInt(port);
  }

  if (proxy.username && proxy.password) {
    proxy_obj.proxyAuth = proxy.username + ':' + proxy.password;
  }

  let proxy_config = {
    proxy: proxy_obj
  };

  // https://www.npmjs.com/package/tunnel
  if (proxy.protocol == 'http' || proxy.protocol == 'https') {
    return tunnel.httpsOverHttp(proxy_config);
  }
}

export function getRandomUserAgent(category: string = 'desktop') {
  return new UserAgent({deviceCategory: category}).toString();
}

/**
 * Randomize the accept language header to confuse fingerprint detection code.
 *
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language
 *
 * The default accept language header is "en-US,en;q=0.9"
 */
export function getRandomAcceptLanguageHeader() {
  /*
  A language tag (which is sometimes referred to as a "locale identifier"). This consists of a 2-3 letter base language tag representing the language, optionally followed by additional subtags separated by '-'. The most common extra information is the country or region variant (like 'en-US' or 'fr-CA')
   */
  let locales = ['en-DE', 'fr-CA', 'fr-FR', 'de-DE', 'en-GB', 'pt-BR', 'es-MX', 'zh-CN',
    'zh-TW', 'es-ES', 'es-CO', 'es-US', 'de-CH', 'de-AT', 'nl-NL', 'nl-BE', 'se-SE'];

  shuffle(locales);

  let locale = locales[0];
  let lang = locale.split('-')[0];

  return `${locale},${lang};q=0.9,en;q=0.8,en-US;q=0.7`;
}

/**
 * Data taken from here: https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide
 */
export function getRandomScreenSize() {
  return supported_screen_sizes[Math.floor(Math.random() * supported_screen_sizes.length)];
}

/**
 * Shuffles array in place. ES6 version
 * @param {Array} a items An array containing the items.
 */
export function shuffle(a: Array<any>) {
  for (let i: number = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getRandomIPApi() {
  const api_urls = ['https://ipinfo.io/json', 'https://ipapi.co/json'];
  shuffle(api_urls);
  return api_urls[0];
}
