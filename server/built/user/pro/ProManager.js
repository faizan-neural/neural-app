"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const EnvVars_1 = require("../../utils/EnvVars");
const Logger_1 = require("../../utils/Logger");
const FeatureFlags_1 = require("../FeatureFlags");
const ICapRoverEvent_1 = require("./../events/ICapRoverEvent");
const API_KEY_HEADER = 'x-api-key';
class ProManager {
    constructor(proDataStore, featureFlagsProvider) {
        this.proDataStore = proDataStore;
        this.featureFlagsProvider = featureFlagsProvider;
        //
    }
    static incrementApiDomain() {
        this.activeApiIndex++;
    }
    static getBaseUrl() {
        return (CaptainConstants_1.default.configs.proApiDomains[ProManager.activeApiIndex %
            CaptainConstants_1.default.configs.proApiDomains.length] + '/api/v1');
    }
    callApi(method, path, data, apiKeyOverride) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.getHeaders(apiKeyOverride);
        })
            .then(function (headers) {
            return (0, axios_1.default)({
                method: method,
                data: data,
                url: ProManager.getBaseUrl() + path,
                headers: headers,
            });
        })
            .then(function (axiosResponse) {
            return axiosResponse.data; // actual HTTP response data
        })
            .then(function (data) {
            if (data.status === 1100) {
                return self.proDataStore
                    .clearAllProConfigs() //
                    .then(function () {
                    throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_PRO_API_KEY_INVALIDATED, 'Invalid API Key, removing API Key from the config');
                });
            }
            if (data.status && data.status !== 100) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, data.description);
            }
            if (!data.data)
                throw new Error('Unexpected Pro API response');
            return data.data; // pulling out data part of CapRover Pro API response
        })
            .catch((err) => {
            Logger_1.default.e(err);
            if (err.captainErrorType) {
                throw err;
            }
            // only switch to the backup instance if the main instance is throwing unknown error
            ProManager.incrementApiDomain();
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Pro API failed`);
        });
    }
    getHeaders(apiKeyOverride) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return apiKeyOverride
                ? apiKeyOverride
                : self.proDataStore.getApiKey();
        })
            .then(function (apiKey) {
            return self.proDataStore
                .getInstallationId()
                .then(function (installationId) {
                const allHeaders = {
                    'x-caprover-version': CaptainConstants_1.default.configs.version,
                    'x-installation-id': installationId,
                };
                allHeaders[API_KEY_HEADER] = apiKey;
                return allHeaders;
            });
        });
    }
    getState() {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.proDataStore.getApiKey();
        })
            .then(function (apiKey) {
            const flags = self.featureFlagsProvider.getFeatureFlags();
            return {
                isSubscribed: !!apiKey,
                isFeatureFlagEnabled: !!EnvVars_1.default.CAPTAIN_IS_DEBUG || //
                    !!apiKey || // if API key is there, assume feature flag is enabled
                    !!EnvVars_1.default.FORCE_ENABLE_PRO || //
                    (flags && flags[FeatureFlags_1.default.IS_PRO_ENABLED]),
            };
        });
    }
    verifyToken(tokenSuppliedByClient) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.callApi('post', `/caprover/otp/validate`, {
                token: tokenSuppliedByClient,
            });
        })
            .then(function (data) {
            return !!data.isValid;
        });
    }
    validateApiKey(apiKey, instanceUrl) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.callApi('post', `/caprover/claim`, {
                instanceUrl,
            }, apiKey);
        })
            .then(function (data) {
            return !!data.isApiKeyOk;
        });
    }
    regenerateSecret() {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.callApi('post', `/caprover/otp/secret`, {});
        })
            .then(function (data) {
            return data ? `${data.otpPath || ''}` : '';
        });
    }
    getConfig() {
        const self = this;
        return Promise.resolve().then(function () {
            return self.proDataStore.getConfig();
        });
    }
    updateConfig(proConfigs) {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            return self.getConfig();
        })
            .then(function (oldConfig) {
            return self.proDataStore
                .updateConfig(proConfigs)
                .then(function () {
                return self.callApi('post', `/caprover/configs`, {
                    proConfigs: proConfigs,
                });
            })
                .catch((err) => {
                Logger_1.default.e(err);
                if (err.captainErrorType ===
                    ApiStatusCodes_1.default.STATUS_ERROR_PRO_API_KEY_INVALIDATED) {
                    return; // do not revert the config if the API key is invalidated
                }
                return self.proDataStore
                    .updateConfig(oldConfig)
                    .then(function () {
                    throw err;
                });
            });
        })
            .then(function () {
            //
        });
    }
    reportEvent(event) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.callApi('post', `/caprover/event`, { event });
        })
            .catch((err) => {
            Logger_1.default.e(err);
        });
    }
    isEventEnabledForProReporting(event) {
        switch (event.eventType) {
            case ICapRoverEvent_1.CapRoverEventType.AppBuildFailed:
            case ICapRoverEvent_1.CapRoverEventType.UserLoggedIn:
            case ICapRoverEvent_1.CapRoverEventType.AppBuildSuccessful:
                return true;
            case ICapRoverEvent_1.CapRoverEventType.InstanceStarted:
            case ICapRoverEvent_1.CapRoverEventType.OneClickAppDetailsFetched:
            case ICapRoverEvent_1.CapRoverEventType.OneClickAppListFetched:
                return false;
        }
    }
    reportUnAuthAnalyticsEvent(event) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.getHeaders();
        })
            .then(function (headers) {
            headers[API_KEY_HEADER] = '';
            return (0, axios_1.default)({
                method: 'post',
                data: { event },
                url: `${CaptainConstants_1.default.configs.analyticsDomain}/api/v1/analytics/event`,
                headers: headers,
            });
        })
            .then(function (axiosResponse) {
            return axiosResponse.data; // actual HTTP response data
        })
            .then(function (data) {
            if (data.status && data.status !== 100) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, data.description);
            }
            if (!data.data)
                throw new Error('Unexpected Pro API response');
            return data.data; // pulling out data part of CapRover Pro API response
        })
            .catch((err) => {
            Logger_1.default.e(err, 'reportUnAuthAnalyticsEvent failed!');
        });
    }
}
exports.default = ProManager;
ProManager.activeApiIndex = Math.floor(Math.random() * 2);
//# sourceMappingURL=ProManager.js.map