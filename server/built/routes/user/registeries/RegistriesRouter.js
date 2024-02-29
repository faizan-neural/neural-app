"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const ApiStatusCodes_1 = require("../../../api/ApiStatusCodes");
const BaseApi_1 = require("../../../api/BaseApi");
const InjectionExtractor_1 = require("../../../injection/InjectionExtractor");
const IRegistryInfo_1 = require("../../../models/IRegistryInfo");
const Logger_1 = require("../../../utils/Logger");
const router = express.Router();
router.get('/', function (req, res, next) {
    const registryHelper = InjectionExtractor_1.default.extractUserFromInjected(res).user.serviceManager.getRegistryHelper();
    let registries = [];
    return Promise.resolve()
        .then(function () {
        return registryHelper.getAllRegistries();
    })
        .then(function (registriesAll) {
        registries = registriesAll;
        return registryHelper.getDefaultPushRegistryId();
    })
        .then(function (defaultPush) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'All registries retrieved');
        baseApi.data = {};
        baseApi.data.registries = registries;
        baseApi.data.defaultPushRegistryId = defaultPush;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/insert/', function (req, res, next) {
    const registryUser = req.body.registryUser + '';
    const registryPassword = req.body.registryPassword + '';
    const registryDomain = req.body.registryDomain + '';
    const registryImagePrefix = req.body.registryImagePrefix + '';
    const registryHelper = InjectionExtractor_1.default.extractUserFromInjected(res).user.serviceManager.getRegistryHelper();
    return Promise.resolve()
        .then(function () {
        return registryHelper.addRegistry(registryUser, registryPassword, registryDomain, registryImagePrefix, IRegistryInfo_1.IRegistryTypes.REMOTE_REG);
    })
        .then(function () {
        const msg = 'Registry is added.';
        Logger_1.default.d(msg);
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, msg));
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
// ERRORS if it's local
router.post('/update/', function (req, res, next) {
    const registryId = req.body.id + '';
    const registryUser = req.body.registryUser + '';
    const registryPassword = req.body.registryPassword + '';
    const registryDomain = req.body.registryDomain + '';
    const registryImagePrefix = req.body.registryImagePrefix + '';
    const registryHelper = InjectionExtractor_1.default.extractUserFromInjected(res).user.serviceManager.getRegistryHelper();
    return Promise.resolve()
        .then(function () {
        return registryHelper.updateRegistry(registryId, registryUser, registryPassword, registryDomain, registryImagePrefix);
    })
        .then(function () {
        const msg = 'Registry is updated.';
        Logger_1.default.d(msg);
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, msg));
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
// ERRORS if default push is this OR if it's local
router.post('/delete/', function (req, res, next) {
    const registryId = req.body.registryId + '';
    const registryHelper = InjectionExtractor_1.default.extractUserFromInjected(res).user.serviceManager.getRegistryHelper();
    return Promise.resolve()
        .then(function () {
        return registryHelper.deleteRegistry(registryId, false);
    })
        .then(function () {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Registry deleted');
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/setpush/', function (req, res, next) {
    const registryId = req.body.registryId + '';
    const registryHelper = InjectionExtractor_1.default.extractUserFromInjected(res).user.serviceManager.getRegistryHelper();
    return Promise.resolve()
        .then(function () {
        return registryHelper.setDefaultPushRegistry(registryId);
    })
        .then(function () {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Push Registry changed');
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
exports.default = router;
//# sourceMappingURL=RegistriesRouter.js.map