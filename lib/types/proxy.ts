import mongoose from 'mongoose';

export enum ProxyType {
  datacenter = 'datacenter',
  dedicated = 'dedicated',
  residential = 'residential',
  mobile = 'mobile'
}

export enum Protocol {
  http = 'http',
  https = 'https',
  socks4 = 'socks4',
  socks5 = 'socks5',
  other = 'other'
}

export enum ProxyProvider {
  luminati = 'luminati',
  cosmoproxy = 'cosmoproxy',
  stormproxies = 'stormproxies',
}

// ISO 3166-1 alpha-2
export enum GeoLocation {
  us = 'us',
  uk = 'uk',
  de = 'de',
  rest = 'rest',
}

export enum ProxyStatus {
  functional = 'functional',
  damaged = 'damaged',
  expired = 'expired'
}

// user can filter with those proxy options
export interface IProxyFilter {
  type?: ProxyType,
  provider?: ProxyProvider,
  subtype?: string;
  proxy?: string;
  protocol?: Protocol;
  whitelisted?: boolean;
  rotating?: boolean;
  username?: string;
  password?: string;
  block_counter?: number;
  proxy_fail_counter?: number;
  geolocation?: GeoLocation;
  recaptcha_passed?: boolean;
}

export const allowed_filter_keys: Array<string> = [
  'type', 'provider', 'subtype', 'proxy', 'protocol', 'whitelisted', 'rotating',
  'username', 'password', 'block_counter','proxy_fail_counter', 'geolocation', 'recaptcha_passed',
];

export enum ProxyChangeReason {
  blocked = 'blocked',
  damaged = 'damaged',
  check_failed = 'check_failed'
}

export interface ProxyOptions {
  // change proxy on every `change`-th request
  // by default, changes on every single request.
  change: number;
  // reason why the proxy is being updated
  // either `damaged` or `blocked`
  reason?: ProxyChangeReason;
  // the filter to find and obtain proxies
  filter: IProxyFilter;
}

export interface IProxy extends mongoose.Document {
  type: ProxyType,
  provider: ProxyProvider,
  status: ProxyStatus;
  subtype: string;
  proxy: string;
  protocol: Protocol;
  // whether proxy authentication is done via whitelisting
  whitelisted: boolean;
  rotating: boolean;
  username: string;
  password: string;
  last_used: Date;
  last_blocked: Date;
  // increment when a site fails despite using this proxy
  block_counter: number;
  // increments when proxy check fails
  proxy_fail_counter: number;
  // increment when proxy is obtained and checked
  obtain_counter: number;
  // the geolocation of the proxy
  geolocation: GeoLocation;
  // detect captcha in page source and see if this current
  // proxy passes the recaptcha detection mechanism
  recaptcha_passed: boolean;
}

export const ProxySchema = new mongoose.Schema({
  type: {
    type: ProxyType,
  },
  provider: {
    type: ProxyProvider,
    required: false,
  },
  status: {
    type: ProxyStatus,
    default: ProxyStatus.functional,
  },
  subtype: {
    type: String,
    required: false
  },
  proxy: {
    type: String,
    required: true,
  },
  protocol: {
    type: Protocol,
    required: true,
    default: Protocol.http
  },
  whitelisted: {
    type: Boolean,
    required: false,
    default: false,
  },
  rotating: {
    type: Boolean,
    required: false,
    default: false,
  },
  username: {
    type: String,
    required: false
  },
  password: {
    type: String,
    required: false
  },
  last_used: {
    type: Date,
  },
  last_blocked: {
    type: Date,
    default: null,
  },
  block_counter: {
    type: Number,
    default: 0,
  },
  proxy_fail_counter: {
    type: Number,
    default: 0,
  },
  obtain_counter: {
    type: Number,
    default: 0,
  },
  geolocation: {
    type: GeoLocation,
    required: false,
    default: GeoLocation.us,
  },
  recaptcha_passed: {
    type: Boolean,
    required: false,
  }
});
