import mongoose from 'mongoose';
import {proxies} from "../fixtures/proxies";
import {ProxyType, ProxyProvider, ProxyStatus, Protocol, GeoLocation, IProxy} from "@lib/types/proxy";

export let ProxySchema = new mongoose.Schema({
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

// unique constraint on several values that constitute a proxy
ProxySchema.index({protocol: 1, proxy: 1, username: 1, password: 1}, {unique: true});

export interface IProxyModel extends mongoose.Model<IProxy> {
}

export class ProxyHandler {
  proxy_model: IProxyModel;

  constructor() {
    const Db = mongoose.connection.useDb('CrawlMaster');
    this.proxy_model = <IProxyModel>Db.model<IProxy>("Proxy", ProxySchema);
  }

  public async drop() {
    await this.proxy_model.collection.drop();
  }

  public async loadProxies() {
    for (let proxy of proxies) {
      proxy.last_used = new Date();
      proxy.last_blocked = null;
      proxy.block_counter = 0;
      proxy.protocol = Protocol.http;

      let filter = {
        protocol: proxy.protocol,
        proxy: proxy.proxy,
      };

      // we do not use findOneAndUpdate() here
      // because it would update the proxy.last_used
      // attribute if the proxy was already inserted
      await this.proxy_model.findOne(filter).then(async (found_proxy) => {
        // if proxy isn't found, create it.
        if (!found_proxy) {
          await this.proxy_model.create(proxy).then((result) => {
            console.log('Inserted proxy: ' + result);
          }).catch((err) => {
            console.error(err);
          });
        }
      }).catch(async (error) => {
        console.error(error.toString());
      });
    }
  }

  public async getAll(filter: any = {}, sort: any = {}) {
    return await this.proxy_model.find(filter).sort(sort).lean();
  }

  /**
   *
   * @param criteria
   * @param update
   */
  public async update(criteria: any, update: any) {
    return await this.proxy_model.updateMany(criteria, update);
  }

  public async deleteAll() {
    return await this.proxy_model.collection.drop();
  }
}