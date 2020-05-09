import {WorkerContext} from ".";
import {BrowserWorkerConfig} from './config';
import {BaseWorker, CleanHtmlOptions} from "./worker";
import {ProxyOptions} from "@lib/types/proxy";
import {ExecutionEnv} from '@lib/types/common';
import {randomElement} from '@lib/misc/helpers';
import {Logger, getLogger} from '@lib/misc/logger';
import {createTempDir, deleteFolderRecursive} from '@lib/misc/helpers';
import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
import {ProxyHandler} from "./proxy";
import {Context} from "aws-lambda";
import {getRandomAcceptLanguageHeader, getRandomScreenSize} from "./helpers";

export class PageError extends Error {
  constructor(message?: string) {
    super(message);
    // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    this.name = 'PageError';
  }
}

export class BrowserWorker extends BaseWorker {
  browser: any;
  page: any;
  clipboardy: any;
  UserAgent: any;
  config: BrowserWorkerConfig;
  logger: Logger;
  user_data_dir?: string;
  user_agent_obj: any;
  user_agent_data: any;
  cleaned: boolean;

  constructor(config: BrowserWorkerConfig, proxy_handler?: ProxyHandler) {
    super(config, proxy_handler);
    this.UserAgent = require('user-agents');
    this.clipboardy = require('clipboardy');
    this.config = config;
    this.logger = getLogger(null, 'browser_worker', config.loglevel);
    this.user_agent_obj = null;
    this.user_agent_data = null;
    this.name = 'BrowserWorker';
    this.cleaned = false;
  }

  public async before_crawl(context: Context | WorkerContext): Promise<any> {
    await super.before_crawl(context);

    if (this.restart_worker && this.crawl_num > 0) {
      await this.setup();
    }
  }

  /**
   * Setup the browser worker.
   */
  public async setup(): Promise<boolean> {
    await BaseWorker.prototype.setup.call(this);

    let success = true;
    try {
      await this.startBrowser();
      await this.setupPage();
    } catch (err) {
      success = false;
      this.logger.error(`Failed to setup ${this.name}: ${err.toString()}`);
      await this.cleanup();
    }
    return success;
  }

  /**
   * Close the browser and the page.
   *
   * Cleanup all resources allocated.
   */
  public async cleanup() {
    if (this.newProxyUrl) {
      this.logger.verbose(`closeAnonymizedProxy(${this.newProxyUrl})`);
      await this.proxyChain.closeAnonymizedProxy(this.newProxyUrl, true);
    }

    if (!this.cleaned) {
      this.logger.info('Cleaning up browser/puppeteer.');

      if (this.page) {
        try {
          await this.page.close();
        } catch (err) {
          this.logger.error(`Could not page.close(): ${err.toString()}`);
        }
      }

      if (this.browser) {
        try {
          await this.browser.close();
        } catch (err) {
          this.logger.error(`Could not browser.close(): ${err.toString()}`);
        }
      }

      if (this.user_data_dir && fs.existsSync(this.user_data_dir)) {
        deleteFolderRecursive(this.user_data_dir);
      }

      this.cleaned = true;
    }
  }

  /**
   * Set proxy in browser worker.
   *
   * Right now there is a restart necessary to set the chromium cmd arg --proxy-server
   *
   * @param options
   */
  public async get_proxy(options: ProxyOptions): Promise<any> {
    let fresh_proxy = await super.get_proxy(options);

    if (fresh_proxy) {
      this.proxy = fresh_proxy;
      await this.setup();
    }
  }

  public async getDebugInfo() {
    let info: any = {};

    if (this.page) {
      try {
        info = {
          screen_b64: await this.page.screenshot({encoding: "base64", type: 'png'}),
          document: await this.page.evaluate(() => {
            return document.documentElement.outerHTML;
          })
        };
      } catch (err) {
        this.logger.error(`Failed to store browser debug information: ${err.toString()}`);
      }
    }
    return info;
  }

  private async setupPage() {
    this.page = await this.browser.newPage();

    // throw page errors by default
    // https://github.com/puppeteer/puppeteer/issues/1890
    this.page.on('error', (msg: any) => {
      throw new PageError(msg);
    });

    // set default navigation timeout
    await this.page.setDefaultNavigationTimeout(this.config.default_navigation_timeout);

    // set default timeout. this affects most methods that can time out.
    await this.page.setDefaultTimeout(this.config.default_navigation_timeout);

    // set accept-language header to standard us english 'en-US,en;q=0.9'
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': this.config.default_accept_language,
    });

    // set additional http headers
    // await page.setExtraHTTPHeaders({ 'foo': 'bar' })
    try {
      if (this.config.headers && typeof this.config.headers === 'object') {
        if (Object.entries(this.config.headers).length > 0) {
          await this.page.setExtraHTTPHeaders(this.config.headers);
          this.logger.info(`Setting headers: ${JSON.stringify(this.config.headers)}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Cannot set headers: ${err}`);
    }

    if (this.config.random_accept_language) {
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': getRandomAcceptLanguageHeader()
      });
    }

    // some proxies require authentication
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication
    // https://github.com/GoogleChrome/puppeteer/issues/2234
    if (this.proxy && this.proxy.username && this.proxy.password) {
      let proxy_auth = {
        username: this.proxy.username,
        password: this.proxy.password,
      };

      this.logger.info(`Chromium proxy auth with: ${JSON.stringify(proxy_auth)}`);

      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication
      await this.page.authenticate(proxy_auth);
    }

    // block certain request types of being loaded
    try {
      if (Array.isArray(this.config.intercept_types) && this.config.intercept_types.length > 0) {
        const allowed_intercept_types = [
          'image',
          'stylesheet',
          'media',
          'font',
          'texttrack',
          'object',
          'beacon',
          'csp_report',
          'imageset',
          'javascript',
        ];
        let intercept = [];

        for (let type of this.config.intercept_types) {
          type = type.toString().toLowerCase();
          if (allowed_intercept_types.includes(type)) {
            intercept.push(type);
          }
        }

        if (intercept.length > 0) {
          this.logger.info(`Intercepting types: ${intercept}`);
          await this.intercept(intercept);
        }
      }
    } catch (err) {
      this.logger.warn(`Cannot set request intercept types: ${err}`);
    }

    // set certain cookies in the browser
    try {
      if (Array.isArray(this.config.cookies) && this.config.cookies.length > 0) {
        for (let cookie of this.config.cookies) {
          this.logger.verbose(`Setting cookie: ${JSON.stringify(cookie)}`);
          await this.page.setCookie({
            'name': cookie.name,
            'value': cookie.value,
            'domain': cookie.domain,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Cannot set cookies: ${err}`);
    }

    // prevent webrtc IP block
    if (this.config.block_webrtc) {
      // that works: https://github.com/puppeteer/puppeteer/issues/4149
      await this.page.evaluateOnNewDocument(
        `navigator.mediaDevices.getUserMedia = navigator.webkitGetUserMedia = navigator.mozGetUserMedia = navigator.getUserMedia = webkitRTCPeerConnection = RTCPeerConnection = MediaStreamTrack = undefined;`
      );
    }

    if (this.config.execution_env === ExecutionEnv.local) {
      if (this.config.test_evasion) {
        this.logger.info('Testing the stealth plugin...');

        await this.page.goto('https://arh.antoinevastel.com/bots/areyouheadless');
        await this.page.waitForSelector('#res');
        await this.page.screenshot({path: 'test_evasion1.png', fullPage: false});
        await this.page.waitFor(500);

        await this.page.goto('https://intoli.com/blog/not-possible-to-block-chrome-headless/chrome-headless-test.html');
        await this.page.waitForSelector('table .result');
        await this.page.screenshot({path: 'test_evasion2.png', fullPage: false});
        await this.page.waitFor(500);

        await this.page.goto('https://bot.sannysoft.com');
        await this.page.waitFor(5000);
        await this.page.screenshot({path: 'test_evasion3.png', fullPage: true});
      }

      if (this.config.test_webrtc_leak) {
        const webrtc_test_pages = ['https://www.expressvpn.com/webrtc-leak-test', 'https://browserleaks.com/webrtc'];

        for (let url of webrtc_test_pages) {
          await this.page.goto(url);
          await this.page.waitFor(10000);
          await this.page.screenshot({
            path: `webrtc_leak_${Date.now()}.jpg`,
            fullPage: false
          });
        }
      }
    }

  }

  /**
   * Starting a browser heavily depends on the environment.
   *
   * When the crawl_worker is running on AWS Lambda or Google GCP,
   * we are using the node module https://github.com/alixaxel/chrome-aws-lambda
   *
   * When the crawl_worker is running within a docker instance on either
   *
   * 1) zenika/alpine-chrome:with-node from https://github.com/Zenika/alpine-chrome
   * 2) node:10.17.0-slim
   *
   * we won't use chrome-aws-lambda, instead we have to pass our
   * own chromium options such as
   *
   * {
      bindAddress: "0.0.0.0",
      args: [
        "--headless",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--remote-debugging-port=9222",
        "--remote-debugging-address=0.0.0.0"
      ]
     }
   */
  private async startBrowser() {
    let pptr_options: any = {
      headless: this.config.headless === undefined ? true : this.config.headless,
      args: [],
      ignoreDefaultArgs: ['--enable-automation', '--disable-extensions'],
    };

    let user_agent = this.config.user_agent;

    // pick a random desktop user agent
    if (this.config.random_user_agent) {
      this.user_agent_obj = new this.UserAgent({deviceCategory: 'desktop'});
    }

    // pick a random user agent according to users wish
    if (this.config.user_agent_options) {
      this.user_agent_obj = new this.UserAgent(this.config.user_agent_options);
    }

    if (this.user_agent_obj) {
      this.user_agent_data = this.user_agent_obj.data;
      user_agent = this.user_agent_obj.toString();
    }

    // when set, change the timezone and language environment variables
    // that the chromium executable interprets
    if (this.config.timezone) {
      this.logger.verbose(`Setting timezone: ${this.config.timezone}`);
      process.env['TZ'] = this.config.timezone;
    }

    if (this.config.language) {
      this.logger.verbose(`Setting language: ${this.config.language}`);
      process.env['LANGUAGE'] = this.config.language;
    }

    if (this.config.execution_env === ExecutionEnv.docker) {
      pptr_options = await this.configureDockerBrowser();
    } else if (this.config.execution_env === ExecutionEnv.lambda) {
      pptr_options = await this.configureAwsLambdaBrowser(pptr_options);
    }

    // set chromium binary path from client
    if (this.config.chromium_binary && fs.existsSync(this.config.chromium_binary)) {
      pptr_options.executablePath = this.config.chromium_binary;
    }

    // potentially set user data dir
    if (this.config.user_data_dir && this.config.user_data_dir.length > 0) {
      try {
        if (!fs.existsSync(this.config.user_data_dir)) {
          fs.mkdirSync(this.config.user_data_dir, {recursive: true});
        }
        this.user_data_dir = this.config.user_data_dir;
        pptr_options.userDataDir = this.config.user_data_dir;
      } catch (err) {
        this.logger.error(`Error configuring userDataDir: ${err.toString()}`);
      }
    }

    // creates a random user data dir
    // this means that all cookies and stored website data will be deleted
    // from previous browsing sessions
    if (this.config.random_user_data_dir) {
      try {
        this.user_data_dir = await createTempDir();
        this.logger.verbose(`Using random user data dir ${this.user_data_dir}`);
        pptr_options.userDataDir = this.user_data_dir;
      } catch (err) {
        this.logger.error(`Error creating random userDataDir: ${err.toString()}`);
      }
    }

    if (typeof this.config.dumpio === 'boolean' && this.config.dumpio === true) {
      pptr_options.dumpio = true;
    }

    pptr_options.args.push(`--user-agent=${user_agent}`);

    if (this.newProxyUrl) {
      pptr_options.args.push(`--proxy-server=${this.newProxyUrl}`);
    } else if (this.proxy && this.proxy.proxy.length > 0) {
      let proxy_str = this.proxy.protocol || 'http';
      proxy_str += '://' + this.proxy.proxy;
      let proxy_flag = '--proxy-server=' + proxy_str;
      pptr_options.args.push(proxy_flag);
    }

    // overwrite puppeteer args with args given by client
    if (Array.isArray(this.config.pup_args)) {
      for (let arg of this.config.pup_args) {
        if (!pptr_options.args.includes(arg)) {
          pptr_options.args.push(arg);
        }
      }
    }

    if (this.config.apply_evasion) {
      const stealth = StealthPlugin();
      // when we set a random user agent, the defaults are not correct anymore.
      // we need to update the platform accordingly
      if (this.user_agent_data) {
        this.logger.verbose(`Using StealthPlugin with overriding platform: ${this.user_agent_data.platform}`);
        // Remove this specific stealth plugin from the default set
        stealth.enabledEvasions.delete("user-agent-override");
        puppeteer.use(stealth);
        // Stealth plugins are just regular `puppeteer-extra` plugins and can be added as such
        const UserAgentOverride = require("puppeteer-extra-plugin-stealth/evasions/user-agent-override");
        // Define custom UA, locale and platform
        const ua = UserAgentOverride({
          userAgent: user_agent,
          locale: 'en-US,en',
          platform: this.user_agent_data.platform,
        });
        puppeteer.use(ua);
      } else {
        // Add stealth plugin and use defaults (all tricks to hide puppeteer usage)
        this.logger.verbose('Using full StealthPlugin for puppeteer');
        puppeteer.use(StealthPlugin());
      }
    }

    // when the caller sets a recaptcha provider api credentials, use the plugin:
    // https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-recaptcha
    if (this.config.recaptcha_provider && this.config.recaptcha_provider.token) {
      this.logger.verbose('Initializing recaptcha solving plugin');
      puppeteer.use(
        RecaptchaPlugin({
          provider: this.config.recaptcha_provider
        })
      )
    }

    this.logger.debug(JSON.stringify(pptr_options, null, 2));
    this.logger.verbose(JSON.stringify(pptr_options.args, null, 2));
    // finally, launch the browser
    this.browser = await puppeteer.launch(pptr_options);
  }

  /**
   * Configure the browser with options specific to using puppeteer
   * within a docker environment.
   */
  private async configureDockerBrowser(): Promise<any> {
    if (process.env.USING_XVFB === '1' && process.env.XVFB_WHD) {
      let dimensions = process.env.XVFB_WHD.split('x');
      // randomize the viewport a bit, in order to prevent bot networks such as Distil to
      // create a bot browser profile
      this.config.viewport = {
        width: parseInt(dimensions[0]),
        height: parseInt(dimensions[1]),
      };

      this.logger.verbose(`Setting viewport based on XVFB_WHD: ${JSON.stringify(this.config.viewport)}`);
    }

    if (this.config.random_viewport) {
      this.config.viewport = getRandomScreenSize();
      this.logger.verbose(`Picked random viewport: ${JSON.stringify(this.config.viewport)}`);
    }

    let headless: boolean = true;

    if (process.env.USING_XVFB === '1') {
      // when we are using XVFB frame buffer server, we start pptr with headless false
      headless = false;
      this.logger.verbose(`Using Xvfb server: headless=${headless}`);
    }

    // try to set as few arguments as possible
    // Pete did a wonderful job here: https://peter.sh/experiments/chromium-command-line-switches/
    let pptr_options: any = {
      headless: headless,
      // https://github.com/puppeteer/puppeteer/blob/8b49dc62a62282543ead43541316e23d3450ff3c/lib/Launcher.js#L259
      ignoreDefaultArgs: ['--enable-automation', '--disable-extensions', /*'--disable-backgrounding-occluded-windows'*/],
      defaultViewport: null, // the default viewport is 800x600, set to null to disable it
      ignoreHTTPSErrors: true,
      args: [
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--window-size=${this.config.viewport.width},${this.config.viewport.height}`,
        // '--no-zygote',
        // '--single-process',
      ]
    };

    // prevent webrtc IP block by loading the extension
    if (this.config.block_webrtc_extension) {
      if (!fs.existsSync('./chrome_extensions/webrtc-blocker')) {
        throw new Error('webrtc-blocker extension does not exist');
      }

      pptr_options.args.push(`--disable-extensions-except=./chrome_extensions/webrtc-blocker`);
      pptr_options.args.push(`--load-extension=./chrome_extensions/webrtc-blocker`);

      this.logger.verbose(`Loading extension webrtc-blocker`);
    }

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      pptr_options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    return pptr_options;
  }

  /**
   * Configure puppeteer when using Aws Lambda runtime.
   *
   * @param pptr_options
   */
  private async configureAwsLambdaBrowser(pptr_options: any) {
    const chromium = require('chrome-aws-lambda');
    // default puppeteer args originate from
    // https://github.com/alixaxel/chrome-aws-lambda
    pptr_options.args = chromium.args;
    pptr_options.defaultViewport = chromium.defaultViewport;
    pptr_options.executablePath = await chromium.executablePath;
    pptr_options.headless = chromium.headless;
    return pptr_options;
  }

  private async intercept(intercept: Array<string>) {
    await this.page.setRequestInterception(true);
    this.page.on('request', (req: any) => {
      let type = req.resourceType();
      if (intercept.includes(type.toLowerCase())) {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  /**
   * uploadFile() is broken in 2.1.0 and 2.1.1
   * Solution: https://github.com/puppeteer/puppeteer/issues/5420
   *
   * @param selector: the file input selector
   * @param file_path: an absolute path to the local file to be uploaded
   * @returns {Promise<void>}
   */
  async upload_file(selector: string, file_path: string) {
    const uploadInput = await this.page.$(selector);
    await uploadInput.uploadFile(file_path);
    //@ts-ignore
    await this.page.evaluate((inputSelector) => {
      document.querySelector(inputSelector).dispatchEvent(new Event('change', { bubbles: true }));
    }, selector);
  }

  /**
   * Strip away a lot of nasty bloating tags from a html document.
   *
   * Stripping stuff away with regexes is problematic, but sometimes just the
   * way to go.
   *
   * @todo: consider using this: https://www.npmjs.com/package/sanitize-html
   *
   * https://stackoverflow.com/questions/1374088/removing-dom-nodes-when-traversing-a-nodelist
   *
   * :param options
   */
  public async clean_html(options: CleanHtmlOptions, html: string = ''): Promise<string> {
    let tags_to_strip = [];
    const allowed_tags = ['style', 'script', 'noscript'];
    if (options.tags && Array.isArray(options.tags)) {
      for (let tag of options.tags) {
        if (allowed_tags.includes(tag)) {
          tags_to_strip.push(tag);
        }
      }
    }

    this.logger.verbose(`Cleaning html: ${JSON.stringify(options)}`);

    // https://stackoverflow.com/questions/6659351/removing-all-script-tags-from-html-with-js-regular-expression
    if (options.use_regex) {
      let html = await this.page.content();
      try {
        let replace_scripts = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
        html = html.replace(replace_scripts, '');
      } catch (err) {
        this.logger.error(`Error cleaning html with regex: ${err}`)
      }
      return html;
    } else {
      await this.page.evaluate((tags_to_strip: Array<string>) => {

        // taken from se-scraper
        for (var i = 0; i < tags_to_strip.length; i++) {
          Array.prototype.slice.call(document.getElementsByTagName(tags_to_strip[i])).forEach(
            function (item) {
              item.remove();
            });
        }

        // remove all comment nodes
        // @todo: does not seem to work
        try {
          var nodeIterator = document.createNodeIterator(
            document,
            NodeFilter.SHOW_COMMENT,
            {
              acceptNode: function (node) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );
          while (nodeIterator.nextNode()) {
            // @ts-ignore
            nodeIterator.referenceNode.remove();
          }
        } catch (err) {}

      }, tags_to_strip);

      return await this.page.content();
    }
  }

}