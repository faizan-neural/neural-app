"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const BaseApi_1 = require("../../api/BaseApi");
const DataStoreProvider_1 = require("../../datastore/DataStoreProvider");
const InjectionExtractor_1 = require("../../injection/InjectionExtractor");
const Authenticator_1 = require("../../user/Authenticator");
const ICapRoverEvent_1 = require("../../user/events/ICapRoverEvent");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const CircularQueue_1 = require("../../utils/CircularQueue");
const router = express.Router();
const failedLoginCircularTimestamps = new CircularQueue_1.default(5);
router.post('/', function (req, res, next) {
    const password = `${req.body.password || ''}`;
    const otpToken = `${req.body.otpToken || ''}`;
    if (!password) {
        const response = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'password is empty.');
        res.send(response);
        return;
    }
    let authToken;
    const namespace = InjectionExtractor_1.default.extractGlobalsFromInjected(res).namespace;
    const userManagerForLoginOnly = InjectionExtractor_1.default.extractGlobalsFromInjected(res).userManagerForLoginOnly;
    const otpAuthenticatorForLoginOnly = userManagerForLoginOnly.otpAuthenticator;
    const eventLoggerForLoginOnly = userManagerForLoginOnly.eventLogger;
    let loadedHashedPassword = '';
    Promise.resolve() //
        .then(function () {
        return otpAuthenticatorForLoginOnly.is2FactorEnabled();
    })
        .then(function (isEnabled) {
        if (isEnabled && !otpToken) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_OTP_REQUIRED, 'Enter OTP token as well');
        }
    })
        .then(function () {
        const oldestKnownFailedLogin = failedLoginCircularTimestamps.peek();
        if (oldestKnownFailedLogin &&
            new Date().getTime() - oldestKnownFailedLogin < 30000)
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_PASSWORD_BACK_OFF, 'Too many wrong passwords... Wait for 30 seconds and retry.');
        return DataStoreProvider_1.default.getDataStore(namespace).getHashedPassword();
    })
        .then(function (savedHashedPassword) {
        loadedHashedPassword = savedHashedPassword;
        return Authenticator_1.default.getAuthenticator(namespace).getAuthToken({ otpToken, otpAuthenticator: otpAuthenticatorForLoginOnly }, password, loadedHashedPassword);
    })
        .then(function (token) {
        authToken = token;
        return Authenticator_1.default.getAuthenticator(namespace).getAuthTokenForCookies({ otpToken, otpAuthenticator: otpAuthenticatorForLoginOnly }, password, loadedHashedPassword);
    })
        .then(function (cookieAuth) {
        res.cookie(CaptainConstants_1.default.headerCookieAuth, cookieAuth);
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Login succeeded');
        baseApi.data = { token: authToken };
        eventLoggerForLoginOnly.trackEvent(ICapRoverEvent_1.CapRoverEventFactory.create(ICapRoverEvent_1.CapRoverEventType.UserLoggedIn, {
            ip: req.headers['x-real-ip'] || 'unknown',
        }));
        res.send(baseApi);
    })
        .catch(function (err) {
        return new Promise(function (resolve, reject) {
            if (err &&
                err.captainErrorType &&
                err.captainErrorType ===
                    ApiStatusCodes_1.default.STATUS_WRONG_PASSWORD) {
                failedLoginCircularTimestamps.push(new Date().getTime());
            }
            reject(err);
        });
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
exports.default = router;
//# sourceMappingURL=LoginRouter.js.map