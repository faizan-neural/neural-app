"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const ApiStatusCodes_1 = require("../../../api/ApiStatusCodes");
const BaseApi_1 = require("../../../api/BaseApi");
const InjectionExtractor_1 = require("../../../injection/InjectionExtractor");
const ProManagerUtils_1 = require("../../../user/pro/ProManagerUtils");
const CaptainConstants_1 = require("../../../utils/CaptainConstants");
const OTP_TOKEN_LENGTH = 6;
const router = express.Router();
router.post('/apikey/', function (req, res, next) {
    const apiKey = `${req.body.apiKey || ''}`;
    const userManager = InjectionExtractor_1.default.extractUserFromInjected(res).user.userManager;
    Promise.resolve()
        .then(function () {
        return userManager.datastore.getRootDomain();
    })
        .then(function (rootDomain) {
        return userManager.proManager.validateApiKey(apiKey, `${CaptainConstants_1.default.configs.captainSubDomain}.${rootDomain}`);
    })
        .then(function (isValid) {
        if (!isValid) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Invalid API Key');
        }
        return userManager.datastore.getProDataStore().setApiKey(apiKey);
    })
        .then(function () {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'API Key is set');
        baseApi.data = {};
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/otp/', function (req, res, next) {
    const otpAuthenticator = InjectionExtractor_1.default.extractUserFromInjected(res).user.otpAuthenticator;
    Promise.resolve()
        .then(function () {
        return otpAuthenticator.is2FactorEnabled();
    })
        .then(function (enabled) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, enabled
            ? 'Two factor auth is enabled'
            : 'Two factor auth is disabled');
        const twoFactorResponse = {
            isEnabled: !!enabled,
        };
        baseApi.data = twoFactorResponse;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/otp/', function (req, res, next) {
    const enabled = !!req.body.enabled;
    const token = `${req.body.token || ''}`.substring(0, OTP_TOKEN_LENGTH);
    const otpAuthenticator = InjectionExtractor_1.default.extractUserFromInjected(res).user.otpAuthenticator;
    Promise.resolve()
        .then(function () {
        return otpAuthenticator.set2fa(enabled, token);
    })
        .then(function (twoFactorResponse) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, enabled
            ? 'Two factor auth is enabled'
            : 'Two factor auth is disabled');
        baseApi.data = twoFactorResponse;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/configs/', function (req, res, next) {
    const userManager = InjectionExtractor_1.default.extractUserFromInjected(res).user.userManager;
    Promise.resolve()
        .then(function () {
        return userManager.proManager.updateConfig(ProManagerUtils_1.default.ensureProConfigType(req.body.proConfigs));
    })
        .then(function () {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Config updated');
        baseApi.data = {};
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/configs/', function (req, res, next) {
    const userManager = InjectionExtractor_1.default.extractUserFromInjected(res).user.userManager;
    Promise.resolve()
        .then(function () {
        return userManager.proManager.getConfig();
    })
        .then(function (proConfigs) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Config retrieved');
        baseApi.data = { proConfigs: proConfigs };
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/state/', function (req, res, next) {
    const userManager = InjectionExtractor_1.default.extractUserFromInjected(res).user.userManager;
    Promise.resolve()
        .then(function () {
        return userManager.proManager.getState();
    })
        .then(function (proFeaturesState) {
        const testType = proFeaturesState;
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Config retrieved');
        baseApi.data = { proFeaturesState: testType };
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
exports.default = router;
//# sourceMappingURL=ProRouter.js.map