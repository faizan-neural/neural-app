"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const BaseApi_1 = require("../../api/BaseApi");
const InjectionExtractor_1 = require("../../injection/InjectionExtractor");
const Injector = require("../../injection/Injector");
const Authenticator_1 = require("../../user/Authenticator");
const EnvVars_1 = require("../../utils/EnvVars");
const Utils_1 = require("../../utils/Utils");
const AppsRouter_1 = require("./apps/AppsRouter");
const OneClickAppRouter_1 = require("./oneclick/OneClickAppRouter");
const ProRouter_1 = require("./pro/ProRouter");
const RegistriesRouter_1 = require("./registeries/RegistriesRouter");
const SystemRouter_1 = require("./system/SystemRouter");
const onFinished = require("on-finished");
const router = express.Router();
const threadLockNamespace = {};
router.use('/apps/webhooks/', Injector.injectUserForWebhook());
// Only for POST request to build the image
// Ensure that it doesn't allow for GET requests etc.
router.post('/apps/appData/:appName/', Injector.injectUserForBuildTrigger());
router.use(Injector.injectUser());
router.use(function (req, res, next) {
    const user = InjectionExtractor_1.default.extractUserFromInjected(res).user;
    if (!user) {
        const response = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_NOT_AUTHORIZED, 'The request is not authorized.');
        res.send(response);
        return;
    }
    if (!user.initialized) {
        const response = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_USER_NOT_INITIALIZED, 'User data is being loaded... Please wait...');
        res.send(response);
        return;
    }
    const namespace = user.namespace;
    if (!namespace) {
        const response = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_NOT_AUTHORIZED, 'Cannot find the namespace attached to this user');
        res.send(response);
        return;
    }
    // All requests except GET might be making changes to some stuff that are not designed for an asynchronous process
    // I'm being extra cautious. But removal of this lock mechanism requires testing and consideration of edge cases.
    if (Utils_1.default.isNotGetRequest(req)) {
        if (EnvVars_1.default.DEMO_MODE_ADMIN_IP) {
            const realIp = `${req.headers['x-real-ip']}`;
            const forwardedIp = `${req.headers['x-forwarded-for']}`;
            if (!realIp ||
                !Utils_1.default.isValidIp(realIp) ||
                realIp !== forwardedIp ||
                EnvVars_1.default.DEMO_MODE_ADMIN_IP !== realIp) {
                const response = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Demo mode is only for viewing purposes.');
                res.send(response);
                return;
            }
        }
        if (threadLockNamespace[namespace]) {
            // Changed to HTTP status code so that the webhook and 3rd party services can understand this.
            res.status(429);
            res.send('Another operation still in progress... please wait...');
            return;
        }
        // we don't want the same space to go under two simultaneous changes
        threadLockNamespace[namespace] = true;
        onFinished(res, function () {
            threadLockNamespace[namespace] = false;
        });
    }
    next();
});
router.post('/changepassword/', function (req, res, next) {
    const namespace = InjectionExtractor_1.default.extractUserFromInjected(res).user.namespace;
    const dataStore = InjectionExtractor_1.default.extractUserFromInjected(res).user.dataStore;
    Promise.resolve() //
        .then(function (data) {
        return dataStore.getHashedPassword();
    })
        .then(function (savedHashedPassword) {
        return Authenticator_1.default.getAuthenticator(namespace).changepass(req.body.oldPassword, req.body.newPassword, savedHashedPassword);
    })
        .then(function (hashedPassword) {
        return dataStore.setHashedPassword(hashedPassword);
    })
        .then(function () {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Password changed.'));
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.use('/apps/', AppsRouter_1.default);
router.use('/oneclick/', OneClickAppRouter_1.default);
router.use('/registries/', RegistriesRouter_1.default);
router.use('/system/', SystemRouter_1.default);
router.use('/pro/', ProRouter_1.default);
exports.default = router;
//# sourceMappingURL=UserRouter.js.map