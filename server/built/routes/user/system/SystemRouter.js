"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const validator_1 = require("validator");
const ApiStatusCodes_1 = require("../../../api/ApiStatusCodes");
const BaseApi_1 = require("../../../api/BaseApi");
const DockerApi_1 = require("../../../docker/DockerApi");
const DockerUtils_1 = require("../../../docker/DockerUtils");
const InjectionExtractor_1 = require("../../../injection/InjectionExtractor");
const CaptainManager_1 = require("../../../user/system/CaptainManager");
const VersionManager_1 = require("../../../user/system/VersionManager");
const CaptainConstants_1 = require("../../../utils/CaptainConstants");
const Logger_1 = require("../../../utils/Logger");
const Utils_1 = require("../../../utils/Utils");
const SystemRouteSelfHostRegistry_1 = require("./selfhostregistry/SystemRouteSelfHostRegistry");
const router = express.Router();
router.use('/selfhostregistry/', SystemRouteSelfHostRegistry_1.default);
router.post('/createbackup/', function (req, res, next) {
    const backupManager = CaptainManager_1.default.get().getBackupManager();
    Promise.resolve()
        .then(function () {
        return backupManager.createBackup(CaptainManager_1.default.get());
    })
        .then(function (backupInfo) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Backup created.');
        baseApi.data = backupInfo;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/changerootdomain/', function (req, res, next) {
    const requestedCustomDomain = Utils_1.default.removeHttpHttps((req.body.rootDomain || '').toLowerCase());
    if (!requestedCustomDomain ||
        requestedCustomDomain.length < 3 ||
        requestedCustomDomain.indexOf('/') >= 0 ||
        requestedCustomDomain.indexOf(':') >= 0 ||
        requestedCustomDomain.indexOf('%') >= 0 ||
        requestedCustomDomain.indexOf(' ') >= 0 ||
        requestedCustomDomain.indexOf('\\') >= 0) {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Bad domain name.'));
        return;
    }
    CaptainManager_1.default.get()
        .changeCaptainRootDomain(requestedCustomDomain, !!req.body.force)
        .then(function () {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Root domain changed.'));
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/enablessl/', function (req, res, next) {
    const emailAddress = req.body.emailAddress || '';
    if (!emailAddress ||
        emailAddress.length < 3 ||
        emailAddress.indexOf('/') >= 0 ||
        emailAddress.indexOf(':') >= 0 ||
        emailAddress.indexOf('%') >= 0 ||
        emailAddress.indexOf(' ') >= 0 ||
        emailAddress.indexOf('\\') >= 0 ||
        !validator_1.default.isEmail(emailAddress)) {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Bad email address.'));
        return;
    }
    CaptainManager_1.default.get()
        .enableSsl(emailAddress)
        .then(function () {
        // This is necessary as the CLI immediately tries to connect to https://captain.root.com
        // Without this delay it'll fail to connect
        Logger_1.default.d('Waiting for 7 seconds...');
        return Utils_1.default.getDelayedPromise(7000);
    })
        .then(function () {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Root SSL Enabled.'));
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/forcessl/', function (req, res, next) {
    const isEnabled = !!req.body.isEnabled;
    CaptainManager_1.default.get()
        .forceSsl(isEnabled)
        .then(function () {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, `Non-SSL traffic is now ${isEnabled ? 'rejected.' : 'allowed.'}`));
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/info/', function (req, res, next) {
    const dataStore = InjectionExtractor_1.default.extractUserFromInjected(res).user.dataStore;
    return Promise.resolve()
        .then(function () {
        return dataStore.getHasRootSsl();
    })
        .then(function (hasRootSsl) {
        return {
            hasRootSsl: hasRootSsl,
            forceSsl: CaptainManager_1.default.get().getForceSslValue(),
            rootDomain: dataStore.hasCustomDomain()
                ? dataStore.getRootDomain()
                : '',
            captainSubDomain: CaptainConstants_1.default.configs.captainSubDomain,
        };
    })
        .then(function (data) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Captain info retrieved');
        baseApi.data = data;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/loadbalancerinfo/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
        return CaptainManager_1.default.get().getLoadBalanceManager().getInfo();
    })
        .then(function (data) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Load Balancer info retrieved');
        baseApi.data = data;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/versionInfo/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
        return VersionManager_1.default.get().getCaptainImageTags();
    })
        .then(function (data) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Version Info Retrieved');
        baseApi.data = data;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/versionInfo/', function (req, res, next) {
    const latestVersion = req.body.latestVersion;
    const registryHelper = InjectionExtractor_1.default.extractUserFromInjected(res).user.serviceManager.getRegistryHelper();
    return Promise.resolve()
        .then(function () {
        return VersionManager_1.default.get().updateCaptain(latestVersion, registryHelper);
    })
        .then(function () {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Captain update process has started...');
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/netdata/', function (req, res, next) {
    const dataStore = InjectionExtractor_1.default.extractUserFromInjected(res).user.dataStore;
    return Promise.resolve()
        .then(function () {
        return dataStore.getNetDataInfo();
    })
        .then(function (data) {
        data.netDataUrl = `${CaptainConstants_1.default.configs.captainSubDomain}.${dataStore.getRootDomain()}${CaptainConstants_1.default.netDataRelativePath}`;
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Netdata info retrieved');
        baseApi.data = data;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/netdata/', function (req, res, next) {
    const netDataInfo = req.body.netDataInfo;
    netDataInfo.netDataUrl = undefined; // Frontend app returns this value, but we really don't wanna save this.
    // root address is subject to change.
    return Promise.resolve()
        .then(function () {
        return CaptainManager_1.default.get().updateNetDataInfo(netDataInfo);
    })
        .then(function () {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Netdata info is updated');
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/nginxconfig/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
        return CaptainManager_1.default.get().getNginxConfig();
    })
        .then(function (data) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Nginx config retrieved');
        baseApi.data = data;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/nginxconfig/', function (req, res, next) {
    const baseConfigCustomValue = req.body.baseConfig.customValue;
    const captainConfigCustomValue = req.body.captainConfig.customValue;
    return Promise.resolve()
        .then(function () {
        return CaptainManager_1.default.get().setNginxConfig(baseConfigCustomValue, captainConfigCustomValue);
    })
        .then(function () {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Nginx config is updated');
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/nodes/', function (req, res, next) {
    return Promise.resolve()
        .then(function () {
        return CaptainManager_1.default.get().getNodesInfo();
    })
        .then(function (data) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Node info retrieved');
        baseApi.data = { nodes: data };
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/nodes/', function (req, res, next) {
    const MANAGER = 'manager';
    const WORKER = 'worker';
    const registryHelper = InjectionExtractor_1.default.extractUserFromInjected(res).user.serviceManager.getRegistryHelper();
    let isManager;
    if (req.body.nodeType === MANAGER) {
        isManager = true;
    }
    else if (req.body.nodeType === WORKER) {
        isManager = false;
    }
    else {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Node type should be either manager or worker'));
        return;
    }
    const privateKey = req.body.privateKey;
    const remoteNodeIpAddress = req.body.remoteNodeIpAddress;
    const captainIpAddress = req.body.captainIpAddress;
    const sshPort = parseInt(req.body.sshPort) || 22;
    const sshUser = (req.body.sshUser || 'root').trim();
    if (!captainIpAddress || !remoteNodeIpAddress || !privateKey) {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Private Key, Captain IP address, remote IP address and remote username should all be present'));
        return;
    }
    return Promise.resolve()
        .then(function () {
        return registryHelper.getDefaultPushRegistryId();
    })
        .then(function (defaultRegistry) {
        if (!defaultRegistry) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'There is no default Docker Registry. You need a repository for your images before adding nodes. Read docs.');
        }
    })
        .then(function () {
        return DockerUtils_1.default.joinDockerNode(DockerApi_1.default.get(), sshUser, sshPort, captainIpAddress, isManager, remoteNodeIpAddress, privateKey);
    })
        .then(function () {
        const msg = 'Docker node is successfully joined.';
        Logger_1.default.d(msg);
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, msg));
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
exports.default = router;
//# sourceMappingURL=SystemRouter.js.map