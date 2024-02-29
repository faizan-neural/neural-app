"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const uuid_1 = require("uuid");
const ApiStatusCodes_1 = require("../../../../api/ApiStatusCodes");
const BaseApi_1 = require("../../../../api/BaseApi");
const InjectionExtractor_1 = require("../../../../injection/InjectionExtractor");
const IRegistryInfo_1 = require("../../../../models/IRegistryInfo");
const CaptainManager_1 = require("../../../../user/system/CaptainManager");
const CaptainConstants_1 = require("../../../../utils/CaptainConstants");
const Logger_1 = require("../../../../utils/Logger");
const router = express.Router();
// ERRORS if a local already exists in DB
router.post('/enableregistry/', function (req, res, next) {
    const captainManager = CaptainManager_1.default.get();
    const password = (0, uuid_1.v4)();
    const registryHelper = InjectionExtractor_1.default.extractUserFromInjected(res).user.serviceManager.getRegistryHelper();
    return Promise.resolve()
        .then(function () {
        return CaptainManager_1.default.get().getDockerRegistry().enableRegistrySsl();
    })
        .then(function () {
        return captainManager
            .getDockerRegistry()
            .ensureDockerRegistryRunningOnThisNode(password);
    })
        .then(function () {
        return registryHelper.getAllRegistries();
    })
        .then(function (allRegs) {
        for (let index = 0; index < allRegs.length; index++) {
            const element = allRegs[index];
            if (element.registryType === IRegistryInfo_1.IRegistryTypes.LOCAL_REG) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, 'There is already a local registry set up!');
            }
        }
        const user = CaptainConstants_1.default.captainRegistryUsername;
        const domain = captainManager
            .getDockerRegistry()
            .getLocalRegistryDomainAndPort();
        return registryHelper.addRegistry(user, password, domain, user, IRegistryInfo_1.IRegistryTypes.LOCAL_REG);
    })
        .then(function () {
        const msg = 'Local registry is created.';
        Logger_1.default.d(msg);
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, msg));
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
// ERRORS if default push is this
router.post('/disableregistry/', function (req, res, next) {
    const captainManager = CaptainManager_1.default.get();
    const registryHelper = InjectionExtractor_1.default.extractUserFromInjected(res).user.serviceManager.getRegistryHelper();
    return Promise.resolve()
        .then(function () {
        return registryHelper.getAllRegistries();
    })
        .then(function (regs) {
        let localRegistryId = '';
        for (let idx = 0; idx < regs.length; idx++) {
            const element = regs[idx];
            if (element.registryType === IRegistryInfo_1.IRegistryTypes.LOCAL_REG) {
                localRegistryId = element.id;
            }
        }
        return registryHelper.deleteRegistry(localRegistryId, true);
    })
        .then(function () {
        return captainManager.getDockerRegistry().ensureServiceRemoved();
    })
        .then(function () {
        const msg = 'Local registry is removed.';
        Logger_1.default.d(msg);
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, msg));
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
exports.default = router;
//# sourceMappingURL=SystemRouteSelfHostRegistry.js.map