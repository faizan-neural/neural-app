"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const ProManagerUtils_1 = require("../user/pro/ProManagerUtils");
const IS_OTP_ENABLED = 'isOtpEnabled';
const PRO_API_KEY = 'proApiKey';
const PRO_CONFIGS = 'proConfigs';
const INSTALLATION_ID = 'installationId';
const PRO_PREFIX = 'pro';
function getDataKey(key) {
    return PRO_PREFIX + '.' + key;
}
class ProDataStore {
    constructor(data) {
        this.data = data;
    }
    isOtpEnabled() {
        const self = this;
        return Promise.resolve().then(function () {
            return !!self.data.get(getDataKey(IS_OTP_ENABLED));
        });
    }
    setOtpEnabled(isEnabled) {
        const self = this;
        return Promise.resolve().then(function () {
            return self.data.set(getDataKey(IS_OTP_ENABLED), !!isEnabled);
        });
    }
    getApiKey() {
        const self = this;
        return Promise.resolve().then(function () {
            return `${self.data.get(getDataKey(PRO_API_KEY)) || ''}`;
        });
    }
    getInstallationId() {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return `${self.data.get(getDataKey(INSTALLATION_ID)) || ''}`;
        })
            .then(function (installationId) {
            if (installationId)
                return installationId;
            const newId = (0, uuid_1.v4)();
            self.data.set(getDataKey(INSTALLATION_ID), newId);
            return newId;
        });
    }
    clearAllProConfigs() {
        const self = this;
        return Promise.resolve().then(function () {
            return self.data.delete(PRO_PREFIX);
        });
    }
    setApiKey(apiKey) {
        const self = this;
        return Promise.resolve().then(function () {
            return self.data.set(getDataKey(PRO_API_KEY), `${apiKey}`);
        });
    }
    getConfig() {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.data.get(getDataKey(PRO_CONFIGS));
        })
            .then(function (pc) {
            return ProManagerUtils_1.default.ensureProConfigType(pc);
        });
    }
    updateConfig(proConfig) {
        const self = this;
        return Promise.resolve().then(function () {
            return self.data.set(getDataKey(PRO_CONFIGS), proConfig);
        });
    }
}
exports.default = ProDataStore;
//# sourceMappingURL=ProDataStore.js.map