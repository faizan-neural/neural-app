"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Created by kasra on 27/06/17.
 */
const Configstore = require("configstore");
const fs = require("fs-extra");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const Encryptor_1 = require("../utils/Encryptor");
const AppsDataStore_1 = require("./AppsDataStore");
const ProDataStore_1 = require("./ProDataStore");
const RegistriesDataStore_1 = require("./RegistriesDataStore");
// keys:
const NAMESPACE = 'namespace';
const HASHED_PASSWORD = 'hashedPassword';
const CUSTOM_DOMAIN = 'customDomain';
const HAS_ROOT_SSL = 'hasRootSsl';
const FORCE_ROOT_SSL = 'forceRootSsl';
const HAS_REGISTRY_SSL = 'hasRegistrySsl';
const EMAIL_ADDRESS = 'emailAddress';
const NET_DATA_INFO = 'netDataInfo';
const NGINX_BASE_CONFIG = 'nginxBaseConfig';
const NGINX_CAPTAIN_CONFIG = 'nginxCaptainConfig';
const CUSTOM_ONE_CLICK_APP_URLS = 'oneClickAppUrls';
const FEATURE_FLAGS = 'featureFlags';
const DEFAULT_CAPTAIN_ROOT_DOMAIN = 'captain.localhost';
const DEFAULT_NGINX_BASE_CONFIG = fs
    .readFileSync(__dirname + '/../../template/base-nginx-conf.ejs')
    .toString();
const DEFAULT_NGINX_CAPTAIN_CONFIG = fs
    .readFileSync(__dirname + '/../../template/root-nginx-conf.ejs')
    .toString();
let DEFAULT_NGINX_CONFIG_FOR_APP_PATH = __dirname + '/../../template/server-block-conf.ejs';
const SERVER_BLOCK_CONF_OVERRIDE_PATH = CaptainConstants_1.default.captainDataDirectory + '/server-block-conf-override.ejs';
if (fs.pathExistsSync(SERVER_BLOCK_CONF_OVERRIDE_PATH)) {
    DEFAULT_NGINX_CONFIG_FOR_APP_PATH = SERVER_BLOCK_CONF_OVERRIDE_PATH;
}
const DEFAULT_NGINX_CONFIG_FOR_APP = fs
    .readFileSync(DEFAULT_NGINX_CONFIG_FOR_APP_PATH)
    .toString();
class DataStore {
    constructor(namespace) {
        const data = new Configstore(`captain-store-${namespace}`, // This value seems to be unused
        {}, {
            configPath: `${CaptainConstants_1.default.captainDataDirectory}/config-${namespace}.json`,
        });
        this.data = data;
        this.namespace = namespace;
        this.data.set(NAMESPACE, namespace);
        this.appsDataStore = new AppsDataStore_1.default(this.data, namespace);
        this.proDataStore = new ProDataStore_1.default(this.data);
        this.registriesDataStore = new RegistriesDataStore_1.default(this.data, namespace);
    }
    setEncryptionSalt(salt) {
        this.encryptor = new Encryptor_1.default(this.namespace + salt);
        this.appsDataStore.setEncryptor(this.encryptor);
        this.registriesDataStore.setEncryptor(this.encryptor);
    }
    getNameSpace() {
        return this.data.get(NAMESPACE);
    }
    getFeatureFlags() {
        const self = this;
        return self.data.get(FEATURE_FLAGS);
    }
    setFeatureFlags(featureFlags) {
        const self = this;
        return Promise.resolve().then(function () {
            return self.data.set(FEATURE_FLAGS, featureFlags);
        });
    }
    setHashedPassword(newHashedPassword) {
        const self = this;
        return Promise.resolve().then(function () {
            return self.data.set(HASHED_PASSWORD, newHashedPassword);
        });
    }
    getHashedPassword() {
        const self = this;
        return Promise.resolve().then(function () {
            return self.data.get(HASHED_PASSWORD);
        });
    }
    /*
            "smtp": {
                "to": "",
                "hostname": "",
                "server": "",
                "port": "",
                "allowNonTls": false,
                "password": "",
                "username": ""
            },
            "slack": {
                "hook": "",
                "channel": ""
            },
            "telegram": {
                "botToken": "",
                "chatId": ""
            },
            "pushBullet": {
                "fallbackEmail": "",
                "apiToken": ""
            }
     */
    getNetDataInfo() {
        const self = this;
        return Promise.resolve().then(function () {
            const netDataInfo = self.data.get(NET_DATA_INFO) || {};
            netDataInfo.isEnabled = netDataInfo.isEnabled || false;
            netDataInfo.data = netDataInfo.data || {};
            netDataInfo.data.smtp =
                netDataInfo.data.smtp && netDataInfo.data.smtp.username
                    ? netDataInfo.data.smtp
                    : {};
            netDataInfo.data.slack = netDataInfo.data.slack || {};
            netDataInfo.data.telegram = netDataInfo.data.telegram || {};
            netDataInfo.data.pushBullet = netDataInfo.data.pushBullet || {};
            return netDataInfo;
        });
    }
    setNetDataInfo(netDataInfo) {
        const self = this;
        return Promise.resolve().then(function () {
            return self.data.set(NET_DATA_INFO, netDataInfo);
        });
    }
    getRootDomain() {
        return this.data.get(CUSTOM_DOMAIN) || DEFAULT_CAPTAIN_ROOT_DOMAIN;
    }
    hasCustomDomain() {
        return !!this.data.get(CUSTOM_DOMAIN);
    }
    getAppsDataStore() {
        return this.appsDataStore;
    }
    getProDataStore() {
        return this.proDataStore;
    }
    getRegistriesDataStore() {
        return this.registriesDataStore;
    }
    setUserEmailAddress(emailAddress) {
        const self = this;
        return new Promise(function (resolve, reject) {
            self.data.set(EMAIL_ADDRESS, emailAddress);
            resolve();
        });
    }
    getUserEmailAddress() {
        const self = this;
        return new Promise(function (resolve, reject) {
            resolve(self.data.get(EMAIL_ADDRESS));
        });
    }
    setHasRootSsl(hasRootSsl) {
        const self = this;
        return new Promise(function (resolve, reject) {
            self.data.set(HAS_ROOT_SSL, hasRootSsl);
            resolve();
        });
    }
    setForceSsl(forceSsl) {
        const self = this;
        return new Promise(function (resolve, reject) {
            self.data.set(FORCE_ROOT_SSL, forceSsl);
            resolve();
        });
    }
    getForceSsl() {
        const self = this;
        return new Promise(function (resolve, reject) {
            resolve(!!self.data.get(FORCE_ROOT_SSL));
        });
    }
    setHasRegistrySsl(hasRegistrySsl) {
        const self = this;
        return new Promise(function (resolve, reject) {
            self.data.set(HAS_REGISTRY_SSL, hasRegistrySsl);
            resolve();
        });
    }
    getDefaultAppNginxConfig() {
        return Promise.resolve().then(function () {
            return DEFAULT_NGINX_CONFIG_FOR_APP;
        });
    }
    getNginxConfig() {
        const self = this;
        return Promise.resolve().then(function () {
            return {
                baseConfig: {
                    byDefault: DEFAULT_NGINX_BASE_CONFIG,
                    customValue: self.data.get(NGINX_BASE_CONFIG),
                },
                captainConfig: {
                    byDefault: DEFAULT_NGINX_CAPTAIN_CONFIG,
                    customValue: self.data.get(NGINX_CAPTAIN_CONFIG),
                },
            };
        });
    }
    setNginxConfig(baseConfig, captainConfig) {
        const self = this;
        return Promise.resolve().then(function () {
            self.data.set(NGINX_BASE_CONFIG, baseConfig);
            self.data.set(NGINX_CAPTAIN_CONFIG, captainConfig);
        });
    }
    getHasRootSsl() {
        const self = this;
        return new Promise(function (resolve, reject) {
            resolve(self.data.get(HAS_ROOT_SSL));
        });
    }
    getHasRegistrySsl() {
        const self = this;
        return new Promise(function (resolve, reject) {
            resolve(!!self.data.get(HAS_REGISTRY_SSL));
        });
    }
    setCustomDomain(customDomain) {
        const self = this;
        return new Promise(function (resolve, reject) {
            self.data.set(CUSTOM_DOMAIN, customDomain);
            resolve();
        });
    }
    getAllOneClickBaseUrls() {
        const self = this;
        return new Promise(function (resolve, reject) {
            resolve(self.data.get(CUSTOM_ONE_CLICK_APP_URLS));
        }).then(function (dataString) {
            const parsedArray = JSON.parse(dataString || '[]');
            return parsedArray;
        });
    }
    insertOneClickBaseUrl(url) {
        const self = this;
        return new Promise(function (resolve, reject) {
            const parsedArray = JSON.parse(self.data.get(CUSTOM_ONE_CLICK_APP_URLS) || '[]');
            parsedArray.push(url);
            self.data.set(CUSTOM_ONE_CLICK_APP_URLS, JSON.stringify(parsedArray));
            resolve();
        });
    }
    deleteOneClickBaseUrl(url) {
        const self = this;
        return new Promise(function (resolve, reject) {
            const parsedArray = JSON.parse(self.data.get(CUSTOM_ONE_CLICK_APP_URLS) || '[]');
            self.data.set(CUSTOM_ONE_CLICK_APP_URLS, JSON.stringify(parsedArray.filter((it) => it !== url)));
            resolve();
        });
    }
}
exports.default = DataStore;
//# sourceMappingURL=DataStore.js.map