"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const Logger_1 = require("../utils/Logger");
class FeatureFlags {
    static get(datastore) {
        if (!FeatureFlags.instance) {
            FeatureFlags.instance = new FeatureFlags(datastore);
        }
        return FeatureFlags.instance;
    }
    constructor(datastore) {
        this.datastore = datastore;
        this.refreshFeatureFlags();
        const self = this;
        self.featureFlags = self.datastore.getFeatureFlags();
    }
    getFeatureFlags() {
        return this.featureFlags;
    }
    refreshFeatureFlags() {
        const self = this;
        Promise.resolve() //
            .then(function () {
            return axios_1.default.get('https://api-v1.caprover.com/v2/featureflags', {
                params: {
                    currentVersion: CaptainConstants_1.default.configs.version,
                },
            });
        })
            .then(function (responseObj) {
            const resp = responseObj.data;
            if (resp.status !== 100) {
                throw new Error(`Bad response from the upstream version info: ${resp.status}`);
            }
            const data = resp.data;
            self.featureFlags = data.featureFlags;
            return self.datastore.setFeatureFlags(self.featureFlags);
        })
            .catch(function (error) {
            Logger_1.default.e(error);
        })
            .then(function () {
            setTimeout(() => {
                self.refreshFeatureFlags();
            }, 1000 * 3600 * 19.3); // some random hour to avoid constant traffic
        });
    }
}
exports.default = FeatureFlags;
FeatureFlags.IS_PRO_ENABLED = 'isProEnabled';
//# sourceMappingURL=FeatureFlags.js.map