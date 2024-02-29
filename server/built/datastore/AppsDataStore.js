"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const ApacheMd5_1 = require("../utils/ApacheMd5");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const Logger_1 = require("../utils/Logger");
const Utils_1 = require("../utils/Utils");
const isValidPath = require("is-valid-path");
const APP_DEFINITIONS = 'appDefinitions';
function isNameAllowed(name) {
    const isNameFormattingOk = !!name &&
        name.length < 50 &&
        /^[a-z]/.test(name) &&
        /[a-z0-9]$/.test(name) &&
        /^[a-z0-9\-]+$/.test(name) &&
        name.indexOf('--') < 0;
    return isNameFormattingOk && ['captain', 'registry'].indexOf(name) < 0;
}
function isPortValid(portNumber) {
    return portNumber > 0 && portNumber < 65535;
}
class AppsDataStore {
    constructor(data, namepace) {
        this.data = data;
        this.namepace = namepace;
    }
    setEncryptor(encryptor) {
        this.encryptor = encryptor;
    }
    saveApp(appName, app) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            if (!appName) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'App Name should not be empty');
            }
            if (app.forceSsl) {
                let hasAtLeastOneSslDomain = app.hasDefaultSubDomainSsl;
                const customDomainArray = app.customDomain;
                if (customDomainArray && customDomainArray.length > 0) {
                    for (let idx = 0; idx < customDomainArray.length; idx++) {
                        if (customDomainArray[idx].hasSsl) {
                            hasAtLeastOneSslDomain = true;
                        }
                    }
                }
                if (!hasAtLeastOneSslDomain) {
                    throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_OPERATION, 'Cannot force SSL without at least one SSL-enabled domain!');
                }
            }
            if (app.envVars) {
                for (let i = 0; i < app.envVars.length; i++) {
                    const element = app.envVars[i];
                    if (!element.key) {
                        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Environmental Variable key is empty!');
                    }
                }
            }
            if (app.ports) {
                for (let i = 0; i < app.ports.length; i++) {
                    const obj = app.ports[i];
                    if (obj.containerPort && obj.hostPort) {
                        const containerPort = Number(obj.containerPort);
                        const hostPort = Number(obj.hostPort);
                        if (!isPortValid(containerPort) ||
                            !isPortValid(hostPort)) {
                            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Invalid ports: ${hostPort} or ${containerPort}`);
                        }
                    }
                    else {
                        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Host or container port is missing`);
                    }
                }
            }
            if (app.volumes) {
                for (let i = 0; i < app.volumes.length; i++) {
                    const obj = app.volumes[i];
                    if (!obj.containerPath ||
                        !(obj.volumeName || obj.hostPath)) {
                        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'containerPath or the source paths (volume name or host path) are missing');
                    }
                    if (obj.volumeName && obj.hostPath) {
                        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Cannot define both host path and volume name!');
                    }
                    if (!isValidPath(obj.containerPath)) {
                        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Invalid containerPath: ${obj.containerPath}`);
                    }
                    if (obj.hostPath) {
                        if (!isValidPath(obj.hostPath)) {
                            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Invalid volume host path: ${obj.hostPath}`);
                        }
                    }
                    else {
                        if (!obj.volumeName ||
                            !isNameAllowed(obj.volumeName)) {
                            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Invalid volume name: ${obj.volumeName}`);
                        }
                    }
                }
            }
        })
            .then(function () {
            let passwordToBeEncrypted = '';
            let sshKeyToBeEncrypted = '';
            let pushWebhook = app.appPushWebhook;
            if (pushWebhook &&
                pushWebhook.pushWebhookToken &&
                pushWebhook.tokenVersion &&
                pushWebhook.repoInfo &&
                pushWebhook.repoInfo.repo) {
                // we have required info
                passwordToBeEncrypted = pushWebhook.repoInfo.password;
                sshKeyToBeEncrypted = pushWebhook.repoInfo.sshKey || '';
                pushWebhook.repoInfo.password = '';
                pushWebhook.repoInfo.sshKey = '';
            }
            else {
                // some required data is missing. We drop the push data
                pushWebhook = undefined;
            }
            const appToSave = app;
            if (passwordToBeEncrypted) {
                appToSave.appPushWebhook.repoInfo.passwordEncrypted =
                    self.encryptor.encrypt(passwordToBeEncrypted);
            }
            if (sshKeyToBeEncrypted) {
                appToSave.appPushWebhook.repoInfo.sshKeyEncrypted =
                    self.encryptor.encrypt(sshKeyToBeEncrypted);
            }
            return appToSave;
        })
            .then(function (appToSave) {
            self.data.set(`${APP_DEFINITIONS}.${appName}`, appToSave);
        });
    }
    nameAllowedOrThrow(appName) {
        if (!isNameAllowed(appName)) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_BAD_NAME, 'App Name is not allowed. Only lowercase letters and single hyphens are allowed');
        }
        if (this.data.get(`${APP_DEFINITIONS}.${appName}`)) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_ALREADY_EXIST, 'App Name already exists. Please use a different name');
        }
    }
    renameApp(authenticator, oldAppName, newAppName) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            self.nameAllowedOrThrow(newAppName);
            return self.getAppDefinition(oldAppName);
        })
            .then(function (appData) {
            if (appData.appPushWebhook &&
                appData.appPushWebhook.pushWebhookToken) {
                const tokenVersion = (0, uuid_1.v4)();
                return authenticator
                    .getAppPushWebhookToken(newAppName, tokenVersion)
                    .then((val) => {
                    appData.appPushWebhook.pushWebhookToken = val;
                    appData.appPushWebhook.tokenVersion = tokenVersion;
                    return appData;
                });
            }
            return appData;
        })
            .then(function (appData) {
            if (appData.appName)
                appData.appName = newAppName;
            appData.hasDefaultSubDomainSsl = false;
            return self.saveApp(newAppName, appData);
        })
            .then(function () {
            self.data.delete(`${APP_DEFINITIONS}.${oldAppName}`);
            return Utils_1.default.getDelayedPromise(2000);
        });
    }
    getServiceName(appName) {
        return `srv-${this.namepace}--${appName}`;
    }
    getVolumeName(volumeName) {
        return `${this.namepace}--${volumeName}`;
    }
    getAppDefinitions() {
        const self = this;
        return new Promise(function (resolve, reject) {
            const allApps = self.data.get(APP_DEFINITIONS) || {};
            const allAppsUnencrypted = {};
            Object.keys(allApps).forEach(function (appName) {
                allAppsUnencrypted[appName] = allApps[appName];
                const appUnencrypted = allAppsUnencrypted[appName];
                // captainDefinitionFilePath added in v1.2.0, we need to backfill if it doesn't exists.
                appUnencrypted.captainDefinitionRelativeFilePath =
                    appUnencrypted.captainDefinitionRelativeFilePath ||
                        CaptainConstants_1.default.defaultCaptainDefinitionPath;
                const appSave = allApps[appName];
                if (appSave.appPushWebhook &&
                    appSave.appPushWebhook.repoInfo &&
                    (appSave.appPushWebhook.repoInfo.passwordEncrypted ||
                        appSave.appPushWebhook.repoInfo.sshKeyEncrypted)) {
                    const repo = appSave.appPushWebhook.repoInfo;
                    appUnencrypted.appPushWebhook = {
                        tokenVersion: appSave.appPushWebhook.tokenVersion,
                        pushWebhookToken: appSave.appPushWebhook.pushWebhookToken,
                        repoInfo: {
                            repo: repo.repo,
                            user: repo.user,
                            password: repo.passwordEncrypted
                                ? self.encryptor.decrypt(repo.passwordEncrypted)
                                : '',
                            sshKey: repo.sshKeyEncrypted
                                ? self.encryptor.decrypt(repo.sshKeyEncrypted)
                                : '',
                            branch: repo.branch,
                        },
                    };
                }
            });
            resolve(JSON.parse(JSON.stringify(allAppsUnencrypted)));
        });
    }
    getAppDefinition(appName) {
        return this.getAppDefinitions().then(function (allApps) {
            if (!appName) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'App Name should not be empty');
            }
            const app = allApps[appName];
            if (!app) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `App (${appName}) could not be found. Make sure that you have created the app.`);
            }
            return app;
        });
    }
    setSslForDefaultSubDomain(appName, isEnabled) {
        const self = this;
        return this.getAppDefinition(appName).then(function (app) {
            app.hasDefaultSubDomainSsl = !!isEnabled;
            return self.saveApp(appName, app);
        });
    }
    ensureAllAppsSubDomainSslDisabled() {
        const self = this;
        return this.getAppDefinitions().then(function (appDefinitions) {
            const promises = [];
            Object.keys(appDefinitions).forEach((appName) => {
                const APP_NAME = appName;
                promises.push(function () {
                    return Promise.resolve()
                        .then(function () {
                        return self.getAppDefinition(APP_NAME);
                    })
                        .then(function (app) {
                        app.forceSsl = false;
                        return self.saveApp(APP_NAME, app);
                    })
                        .then(function () {
                        return self.setSslForDefaultSubDomain(APP_NAME, false);
                    });
                });
            });
            return Utils_1.default.runPromises(promises);
        });
    }
    enableCustomDomainSsl(appName, customDomain) {
        const self = this;
        return self.getAppDefinition(appName).then(function (app) {
            app.customDomain = app.customDomain || [];
            if (app.customDomain.length > 0) {
                for (let idx = 0; idx < app.customDomain.length; idx++) {
                    if (app.customDomain[idx].publicDomain === customDomain) {
                        app.customDomain[idx].hasSsl = true;
                        return self.saveApp(appName, app);
                    }
                }
            }
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `customDomain: ${customDomain} is not attached to app ${appName}`);
        });
    }
    removeCustomDomainForApp(appName, customDomainToRemove) {
        const self = this;
        return this.getAppDefinition(appName).then(function (app) {
            app.customDomain = app.customDomain || [];
            const newDomains = [];
            let removed = false;
            for (let idx = 0; idx < app.customDomain.length; idx++) {
                if (app.customDomain[idx].publicDomain === customDomainToRemove) {
                    removed = true;
                }
                else {
                    newDomains.push(app.customDomain[idx]);
                }
            }
            if (!removed) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Custom domain ${customDomainToRemove} does not exist in ${appName}`);
            }
            if (app.redirectDomain) {
                if (`${app.redirectDomain}` === customDomainToRemove) {
                    app.redirectDomain = undefined;
                }
                if (newDomains.length === 0) {
                    app.redirectDomain = undefined;
                }
            }
            app.customDomain = newDomains;
            return self.saveApp(appName, app);
        });
    }
    addCustomDomainForApp(appName, customDomain) {
        const self = this;
        return this.getAppDefinition(appName).then(function (app) {
            app.customDomain = app.customDomain || [];
            if (app.customDomain.length > 0) {
                for (let idx = 0; idx < app.customDomain.length; idx++) {
                    if (app.customDomain[idx].publicDomain === customDomain) {
                        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, `App already has customDomain: ${customDomain} attached to app ${appName}`);
                    }
                }
            }
            app.customDomain.push({
                publicDomain: customDomain,
                hasSsl: false,
            });
            return self.saveApp(appName, app);
        });
    }
    addCustomDomainForAppForMigration(appName, hasDefaultSubDomainSsl, customDomains) {
        const self = this;
        return this.getAppDefinition(appName) //
            .then(function (app) {
            app.customDomain = app.customDomain || [];
            for (let idx = 0; idx < customDomains.length; idx++) {
                app.customDomain.push({
                    publicDomain: customDomains[idx].publicDomain + '',
                    hasSsl: !!customDomains[idx].hasSsl,
                });
            }
            app.hasDefaultSubDomainSsl = !!hasDefaultSubDomainSsl;
            return self.saveApp(appName, app);
        });
    }
    verifyCustomDomainBelongsToApp(appName, customDomain) {
        const self = this;
        return self.getAppDefinition(appName).then(function (app) {
            app.customDomain = app.customDomain || [];
            if (app.customDomain.length > 0) {
                for (let idx = 0; idx < app.customDomain.length; idx++) {
                    if (app.customDomain[idx].publicDomain === customDomain) {
                        return true;
                    }
                }
            }
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, `customDomain ${customDomain} is not attached to app ${appName}`);
        });
    }
    setDeployedVersionAndImage(appName, deployedVersion, builtImage) {
        if (!appName) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'App Name should not be empty');
        }
        if (!builtImage || !builtImage.imageName) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'ImageName Name should not be empty');
        }
        const self = this;
        return this.getAppDefinition(appName) //
            .then(function (app) {
            const versions = app.versions;
            let found = false;
            for (let i = 0; i < versions.length; i++) {
                const element = versions[i];
                if (element.version === deployedVersion) {
                    element.deployedImageName = builtImage.imageName;
                    element.gitHash = builtImage.gitHash;
                    found = true;
                    break;
                }
            }
            if (!found) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Version trying to deploy not found ${deployedVersion}`);
            }
            app.deployedVersion = deployedVersion;
            return self.saveApp(appName, app);
        });
    }
    createNewVersion(appName) {
        if (!appName) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'App Name should not be empty');
        }
        const self = this;
        return this.getAppDefinition(appName).then(function (app) {
            // Drop older versions
            app.versions = Utils_1.default.dropFirstElements(app.versions, CaptainConstants_1.default.configs.maxVersionHistory - 1);
            const versions = app.versions;
            let newVersionIndex = versions.length;
            // Just in case some versions from the db were deleted manually!!!
            for (let index = 0; index < versions.length; index++) {
                const element = versions[index];
                if (newVersionIndex <= element.version) {
                    newVersionIndex = element.version + 1;
                }
                // In Ver <= v1.1.0, timeStamp was set to new Date().toString() which creates an inconsistent date format.
                element.timeStamp = element.timeStamp
                    ? new Date(element.timeStamp + '').toISOString()
                    : new Date().toISOString();
            }
            versions.push({
                version: newVersionIndex,
                gitHash: undefined,
                timeStamp: new Date().toISOString(),
            });
            return self.saveApp(appName, app).then(function () {
                return newVersionIndex;
            });
        });
    }
    setVersionsForMigration(appName, vers, deployedVersion) {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            return self.getAppDefinition(appName);
        })
            .then(function (appLoaded) {
            appLoaded.deployedVersion = deployedVersion;
            appLoaded.versions = vers;
            return self.saveApp(appName, appLoaded);
        });
    }
    updateAppDefinitionInDb(appName, description, instanceCount, captainDefinitionRelativeFilePath, envVars, volumes, tags, nodeId, notExposeAsWebApp, containerHttpPort, httpAuth, forceSsl, ports, repoInfo, authenticator, customNginxConfig, redirectDomain, preDeployFunction, serviceUpdateOverride, websocketSupport, appDeployTokenConfig) {
        const self = this;
        let appObj;
        return Promise.resolve()
            .then(function () {
            return self.getAppDefinition(appName);
        })
            .then(function (appLoaded) {
            appObj = appLoaded;
            if (repoInfo &&
                repoInfo.repo &&
                repoInfo.branch &&
                ((repoInfo.user && repoInfo.password) || repoInfo.sshKey)) {
                appObj.appPushWebhook = {
                    tokenVersion: appObj.appPushWebhook &&
                        appObj.appPushWebhook.tokenVersion
                        ? appObj.appPushWebhook.tokenVersion
                        : (0, uuid_1.v4)(),
                    pushWebhookToken: appObj.appPushWebhook
                        ? appObj.appPushWebhook.pushWebhookToken
                        : '',
                    repoInfo: {
                        repo: repoInfo.repo,
                        user: repoInfo.user,
                        branch: repoInfo.branch,
                        password: repoInfo.password,
                        sshKey: repoInfo.sshKey,
                    },
                };
                if (appObj.appPushWebhook.pushWebhookToken) {
                    return Promise.resolve(undefined);
                }
                return authenticator
                    .getAppPushWebhookToken(appName, appObj.appPushWebhook.tokenVersion)
                    .then(function (val) {
                    appObj.appPushWebhook.pushWebhookToken = val;
                });
            }
            else {
                appObj.appPushWebhook = undefined;
                return Promise.resolve(undefined);
            }
        })
            .then(function () {
            instanceCount = Number(instanceCount);
            if (instanceCount >= 0) {
                appObj.instanceCount = instanceCount;
            }
            if (captainDefinitionRelativeFilePath) {
                appObj.captainDefinitionRelativeFilePath =
                    captainDefinitionRelativeFilePath + '';
            }
            appObj.notExposeAsWebApp = !!notExposeAsWebApp;
            appObj.containerHttpPort = containerHttpPort;
            appObj.forceSsl = !!forceSsl;
            appObj.websocketSupport = !!websocketSupport;
            appObj.nodeId = nodeId;
            appObj.customNginxConfig = customNginxConfig;
            appObj.redirectDomain = redirectDomain;
            appObj.preDeployFunction = preDeployFunction;
            appObj.serviceUpdateOverride = serviceUpdateOverride;
            appObj.description = description;
            appObj.tags = tags;
            appObj.appDeployTokenConfig = {
                enabled: !!appDeployTokenConfig.enabled,
                appDeployToken: `${appDeployTokenConfig.appDeployToken
                    ? appDeployTokenConfig.appDeployToken
                    : ''}`,
            };
            if (appObj.appDeployTokenConfig.appDeployToken ===
                'undefined' ||
                appObj.appDeployTokenConfig.appDeployToken === 'null') {
                appObj.appDeployTokenConfig = { enabled: false };
                Logger_1.default.e('Bad values in the token');
            }
            if (!appObj.appDeployTokenConfig.enabled) {
                appObj.appDeployTokenConfig.appDeployToken = undefined;
            }
            else if (!appObj.appDeployTokenConfig.appDeployToken) {
                // App is supposed to have a token, but it doesn't have one yet. The first time use case.
                appObj.appDeployTokenConfig.appDeployToken =
                    Utils_1.default.generateRandomString(32);
            }
            if (httpAuth && httpAuth.user) {
                const newAuth = {
                    user: httpAuth.user + '',
                    passwordHashed: httpAuth.passwordHashed + '',
                };
                if (httpAuth.password) {
                    newAuth.passwordHashed = ApacheMd5_1.default.createApacheHash(httpAuth.password + '');
                }
                appObj.httpAuth = newAuth;
            }
            else {
                appObj.httpAuth = undefined;
            }
            if (ports) {
                appObj.ports = [];
                for (let i = 0; i < ports.length; i++) {
                    const obj = ports[i];
                    const containerPort = Number(obj.containerPort);
                    const hostPort = Number(obj.hostPort);
                    if (!containerPort && !hostPort) {
                        // Empty entry... Skipping...
                        continue;
                    }
                    appObj.ports.push({
                        hostPort: hostPort,
                        containerPort: containerPort,
                    });
                }
            }
            if (envVars) {
                appObj.envVars = [];
                for (let i = 0; i < envVars.length; i++) {
                    const obj = envVars[i];
                    obj.key = (obj.key || '').trim();
                    obj.value = obj.value || '';
                    if (!obj.key && !obj.value) {
                        // Empty entry... Skipping...
                        continue;
                    }
                    appObj.envVars.push({
                        key: obj.key,
                        value: `${obj.value}`,
                    });
                }
            }
            if (volumes) {
                appObj.volumes = [];
                for (let i = 0; i < volumes.length; i++) {
                    const obj = volumes[i];
                    const newVol = {
                        containerPath: (obj.containerPath || '').trim(),
                    };
                    if (obj.hostPath) {
                        newVol.hostPath = (obj.hostPath || '').trim();
                    }
                    else {
                        newVol.volumeName = (obj.volumeName || '').trim();
                    }
                    if (!newVol.containerPath &&
                        !newVol.hostPath &&
                        !newVol.volumeName) {
                        // Empty entry... Skipping...
                        continue;
                    }
                    appObj.volumes.push(newVol);
                }
            }
        })
            .then(function () {
            return self.saveApp(appName, appObj);
        });
    }
    deleteAppDefinition(appName) {
        const self = this;
        return new Promise(function (resolve, reject) {
            if (!isNameAllowed(appName)) {
                reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_BAD_NAME, 'App Name is not allowed. Only lowercase letters and single hyphens are allowed'));
                return;
            }
            if (!self.data.get(`${APP_DEFINITIONS}.${appName}`)) {
                reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'App Name does not exist in Database! Cannot be deleted.'));
                return;
            }
            self.data.delete(`${APP_DEFINITIONS}.${appName}`);
            resolve();
        }).then(function () {
            return Utils_1.default.getDelayedPromise(2000);
        });
    }
    /**
     * Creates a new app definition.
     *
     * @param appName                   The appName you want to register
     * @param hasPersistentData         whether the app has persistent data, you can only run one instance of the app.
     * @returns {Promise}
     */
    registerAppDefinition(appName, hasPersistentData) {
        const self = this;
        return new Promise(function (resolve, reject) {
            if (!isNameAllowed(appName)) {
                reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_BAD_NAME, 'App Name is not allowed. Only lowercase letters and single hyphens are allowed'));
                return;
            }
            if (self.data.get(`${APP_DEFINITIONS}.${appName}`)) {
                reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_ALREADY_EXIST, 'App Name already exists. Please use a different name'));
                return;
            }
            const defaultAppDefinition = {
                hasPersistentData: !!hasPersistentData,
                description: '',
                instanceCount: 1,
                captainDefinitionRelativeFilePath: CaptainConstants_1.default.defaultCaptainDefinitionPath,
                networks: [CaptainConstants_1.default.captainNetworkName],
                envVars: [],
                volumes: [],
                ports: [],
                tags: [],
                versions: [],
                deployedVersion: 0,
                notExposeAsWebApp: false,
                customDomain: [],
                hasDefaultSubDomainSsl: false,
                redirectDomain: '',
                forceSsl: false,
                websocketSupport: false,
            };
            resolve(defaultAppDefinition);
        }).then(function (app) {
            return self.saveApp(appName, app);
        });
    }
}
exports.default = AppsDataStore;
//# sourceMappingURL=AppsDataStore.js.map