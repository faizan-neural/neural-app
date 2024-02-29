"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const DockerApi_1 = require("../docker/DockerApi");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const Logger_1 = require("../utils/Logger");
const Utils_1 = require("../utils/Utils");
const DockerRegistryHelper_1 = require("./DockerRegistryHelper");
const ICapRoverEvent_1 = require("./events/ICapRoverEvent");
const ImageMaker_1 = require("./ImageMaker");
const requireFromString = require("require-from-string");
const ERROR_FIRST_ENABLE_ROOT_SSL = 'You have to first enable SSL for your root domain';
const serviceMangerCache = {};
class ServiceManager {
    static get(namespace, authenticator, dataStore, dockerApi, loadBalancerManager, eventLogger, domainResolveChecker) {
        if (!serviceMangerCache[namespace]) {
            serviceMangerCache[namespace] = new ServiceManager(dataStore, authenticator, dockerApi, loadBalancerManager, eventLogger, domainResolveChecker);
        }
        return serviceMangerCache[namespace];
    }
    constructor(dataStore, authenticator, dockerApi, loadBalancerManager, eventLogger, domainResolveChecker) {
        this.dataStore = dataStore;
        this.authenticator = authenticator;
        this.dockerApi = dockerApi;
        this.loadBalancerManager = loadBalancerManager;
        this.eventLogger = eventLogger;
        this.domainResolveChecker = domainResolveChecker;
        this.activeOrScheduledBuilds = {};
        this.queuedBuilds = [];
        this.buildLogsManager = new ImageMaker_1.BuildLogsManager();
        this.isReady = true;
        this.dockerRegistryHelper = new DockerRegistryHelper_1.default(this.dataStore, this.dockerApi);
        this.imageMaker = new ImageMaker_1.default(this.dockerRegistryHelper, this.dockerApi, this.dataStore.getNameSpace(), this.buildLogsManager);
    }
    getRegistryHelper() {
        return this.dockerRegistryHelper;
    }
    isInited() {
        return this.isReady;
    }
    scheduleDeployNewVersion(appName, source) {
        const self = this;
        const activeBuildAppName = self.isAnyBuildRunning();
        this.activeOrScheduledBuilds[appName] = true;
        self.buildLogsManager.getAppBuildLogs(appName).clear();
        if (activeBuildAppName) {
            const existingBuildForTheSameApp = self.queuedBuilds.find((v) => v.appName === appName);
            if (existingBuildForTheSameApp) {
                self.buildLogsManager
                    .getAppBuildLogs(appName)
                    .log(`A build for ${appName} was queued, it's now being replaced with a new build...`);
                // replacing the new source!
                existingBuildForTheSameApp.source = source;
                const existingPromise = existingBuildForTheSameApp.promiseToSave.promise;
                if (!existingPromise)
                    throw new Error('Existing promise for the queued app is NULL!!');
                return existingPromise;
            }
            self.buildLogsManager
                .getAppBuildLogs(appName)
                .log(`An active build (${activeBuildAppName}) is in progress. This build is queued...`);
            const promiseToSave = {
                resolve: undefined,
                reject: undefined,
                promise: undefined,
            };
            const promise = new Promise(function (resolve, reject) {
                promiseToSave.resolve = resolve;
                promiseToSave.reject = reject;
            });
            promiseToSave.promise = promise;
            self.queuedBuilds.push({ appName, source, promiseToSave });
            // This should only return when the build is finished,
            // somehow we need save the promise in queue - for "attached builds"
            return promise;
        }
        return this.startDeployingNewVersion(appName, source);
    }
    startDeployingNewVersion(appName, source) {
        const self = this;
        const dataStore = this.dataStore;
        let deployedVersion;
        return Promise.resolve() //
            .then(function () {
            return dataStore.getAppsDataStore().createNewVersion(appName);
        })
            .then(function (appVersion) {
            deployedVersion = appVersion;
            return dataStore
                .getAppsDataStore()
                .getAppDefinition(appName)
                .then(function (app) {
                const envVars = app.envVars || [];
                return self.imageMaker.ensureImage(source, appName, app.captainDefinitionRelativeFilePath, appVersion, envVars);
            });
        })
            .then(function (builtImage) {
            return dataStore
                .getAppsDataStore()
                .setDeployedVersionAndImage(appName, deployedVersion, builtImage);
        })
            .then(function () {
            self.onBuildFinished(appName);
            self.eventLogger.trackEvent(ICapRoverEvent_1.CapRoverEventFactory.create(ICapRoverEvent_1.CapRoverEventType.AppBuildSuccessful, {
                appName,
            }));
            return self.ensureServiceInitedAndUpdated(appName);
        })
            .catch(function (error) {
            self.onBuildFinished(appName);
            return new Promise(function (resolve, reject) {
                self.logBuildFailed(appName, error);
                reject(error);
            });
        });
    }
    onBuildFinished(appName) {
        const self = this;
        self.activeOrScheduledBuilds[appName] = false;
        Promise.resolve().then(function () {
            const newBuild = self.queuedBuilds.shift();
            if (newBuild)
                self.startDeployingNewVersion(newBuild.appName, newBuild.source);
        });
    }
    enableCustomDomainSsl(appName, customDomain) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.dataStore.getHasRootSsl();
        })
            .then(function (rootHasSsl) {
            if (!rootHasSsl) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, ERROR_FIRST_ENABLE_ROOT_SSL);
            }
            Logger_1.default.d(`Verifying Captain owns domain: ${customDomain}`);
            return self.domainResolveChecker.verifyCaptainOwnsDomainOrThrow(customDomain, undefined);
        })
            .then(function () {
            Logger_1.default.d(`Enabling SSL for: ${appName} on ${customDomain}`);
            return self.dataStore
                .getAppsDataStore()
                .verifyCustomDomainBelongsToApp(appName, customDomain);
        })
            .then(function () {
            return self.domainResolveChecker.requestCertificateForDomain(customDomain);
        })
            .then(function () {
            return self.dataStore
                .getAppsDataStore()
                .enableCustomDomainSsl(appName, customDomain);
        })
            .then(function () {
            return self.reloadLoadBalancer();
        });
    }
    addCustomDomain(appName, customDomain) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            const rootDomain = self.dataStore.getRootDomain();
            try {
                Utils_1.default.checkCustomDomain(customDomain, appName, rootDomain);
            }
            catch (error) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_BAD_NAME, error);
            }
        })
            .then(function () {
            return self.domainResolveChecker.verifyDomainResolvesToDefaultServerOnHost(customDomain);
        })
            .then(function () {
            Logger_1.default.d(`Enabling custom domain for: ${appName}`);
            return self.dataStore
                .getAppsDataStore()
                .addCustomDomainForApp(appName, customDomain);
        })
            .then(function () {
            return self.reloadLoadBalancer();
        });
    }
    removeCustomDomain(appName, customDomain) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            Logger_1.default.d(`Removing custom domain for: ${appName}`);
            return self.dataStore
                .getAppsDataStore()
                .removeCustomDomainForApp(appName, customDomain);
        })
            .then(function () {
            return self.reloadLoadBalancer();
        });
    }
    enableSslForApp(appName) {
        const self = this;
        let rootDomain;
        return Promise.resolve()
            .then(function () {
            return self.dataStore.getHasRootSsl();
        })
            .then(function (rootHasSsl) {
            if (!rootHasSsl) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, ERROR_FIRST_ENABLE_ROOT_SSL);
            }
            return self.verifyCaptainOwnsGenericSubDomain(appName);
        })
            .then(function () {
            Logger_1.default.d(`Enabling SSL for: ${appName}`);
            return self.dataStore.getRootDomain();
        })
            .then(function (val) {
            rootDomain = val;
            if (!rootDomain) {
                throw new Error('No rootDomain! Cannot verify domain');
            }
        })
            .then(function () {
            // it will ensure that the app exists, otherwise it throws an exception
            return self.dataStore
                .getAppsDataStore()
                .getAppDefinition(appName);
        })
            .then(function () {
            return `${appName}.${rootDomain}`;
        })
            .then(function (domainName) {
            return self.domainResolveChecker.requestCertificateForDomain(domainName);
        })
            .then(function () {
            return self.dataStore
                .getAppsDataStore()
                .setSslForDefaultSubDomain(appName, true);
        })
            .then(function () {
            return self.reloadLoadBalancer();
        });
    }
    verifyCaptainOwnsGenericSubDomain(appName) {
        const self = this;
        let rootDomain;
        return Promise.resolve()
            .then(function () {
            return self.dataStore.getRootDomain();
        })
            .then(function (val) {
            rootDomain = val;
        })
            .then(function () {
            // it will ensure that the app exists, otherwise it throws an exception
            return self.dataStore
                .getAppsDataStore()
                .getAppDefinition(appName);
        })
            .then(function () {
            return `${appName}.${rootDomain}`;
        })
            .then(function (domainName) {
            Logger_1.default.d(`Verifying Captain owns domain: ${domainName}`);
            return self.domainResolveChecker.verifyCaptainOwnsDomainOrThrow(domainName, undefined);
        });
    }
    renameApp(oldAppName, newAppName) {
        Logger_1.default.d(`Renaming app: ${oldAppName}`);
        const self = this;
        const oldServiceName = this.dataStore
            .getAppsDataStore()
            .getServiceName(oldAppName);
        const dockerApi = this.dockerApi;
        const dataStore = this.dataStore;
        let defaultSslOn = false;
        return Promise.resolve()
            .then(function () {
            return dataStore.getAppsDataStore().getAppDefinition(oldAppName);
        })
            .then(function (appDef) {
            defaultSslOn = !!appDef.hasDefaultSubDomainSsl;
            dataStore.getAppsDataStore().nameAllowedOrThrow(newAppName);
            return self.ensureNotBuilding(oldAppName);
        })
            .then(function () {
            Logger_1.default.d(`Check if service is running: ${oldServiceName}`);
            return dockerApi.isServiceRunningByName(oldServiceName);
        })
            .then(function (isRunning) {
            if (!isRunning) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Service is not running!');
            }
            return dockerApi.removeServiceByName(oldServiceName);
        })
            .then(function () {
            return dataStore
                .getAppsDataStore()
                .renameApp(self.authenticator, oldAppName, newAppName);
        })
            .then(function () {
            return self.ensureServiceInitedAndUpdated(newAppName);
        })
            .then(function () {
            if (defaultSslOn)
                return self.enableSslForApp(newAppName);
        });
    }
    removeApp(appName) {
        Logger_1.default.d(`Removing service for: ${appName}`);
        const self = this;
        const serviceName = this.dataStore
            .getAppsDataStore()
            .getServiceName(appName);
        const dockerApi = this.dockerApi;
        const dataStore = this.dataStore;
        return Promise.resolve()
            .then(function () {
            return self.ensureNotBuilding(appName);
        })
            .then(function () {
            Logger_1.default.d(`Check if service is running: ${serviceName}`);
            return dockerApi.isServiceRunningByName(serviceName);
        })
            .then(function (isRunning) {
            if (isRunning) {
                return dockerApi.removeServiceByName(serviceName);
            }
            else {
                Logger_1.default.w(`Cannot delete service... It is not running: ${serviceName}`);
                return true;
            }
        })
            .then(function () {
            return dataStore.getAppsDataStore().deleteAppDefinition(appName);
        })
            .then(function () {
            return self.reloadLoadBalancer();
        });
    }
    removeVolsSafe(volumes) {
        const dockerApi = this.dockerApi;
        const dataStore = this.dataStore;
        const volsFailedToDelete = {};
        return Promise.resolve()
            .then(function () {
            return dataStore.getAppsDataStore().getAppDefinitions();
        })
            .then(function (apps) {
            // Don't even try deleting volumes which are present in other app definitions
            Object.keys(apps).forEach((appName) => {
                const app = apps[appName];
                const volsInApp = app.volumes || [];
                volsInApp.forEach((v) => {
                    const volName = v.volumeName;
                    if (!volName)
                        return;
                    if (volumes.indexOf(volName) >= 0) {
                        volsFailedToDelete[volName] = true;
                    }
                });
            });
            const volumesTryToDelete = [];
            volumes.forEach((v) => {
                if (!volsFailedToDelete[v]) {
                    volumesTryToDelete.push(dataStore.getAppsDataStore().getVolumeName(v));
                }
            });
            return dockerApi.deleteVols(volumesTryToDelete);
        })
            .then(function (failedVols) {
            failedVols.forEach((v) => {
                volsFailedToDelete[v] = true;
            });
            return Object.keys(volsFailedToDelete);
        });
    }
    getUnusedImages(mostRecentLimit) {
        Logger_1.default.d(`Getting unused images, excluding most recent ones: ${mostRecentLimit}`);
        const dockerApi = this.dockerApi;
        const dataStore = this.dataStore;
        let allImages;
        return Promise.resolve()
            .then(function () {
            return dockerApi.getImages();
        })
            .then(function (images) {
            allImages = images;
            return dataStore.getAppsDataStore().getAppDefinitions();
        })
            .then(function (apps) {
            const unusedImages = [];
            if (mostRecentLimit < 0) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, 'Most Recent Limit cannot be negative');
            }
            for (let i = 0; i < allImages.length; i++) {
                const currentImage = allImages[i];
                let imageInUse = false;
                const repoTags = currentImage.RepoTags || [];
                Object.keys(apps).forEach(function (appName) {
                    const app = apps[appName];
                    for (let k = 0; k < mostRecentLimit + 1; k++) {
                        const versionToCheck = Number(app.deployedVersion) - k;
                        if (versionToCheck < 0)
                            continue;
                        let deployedImage = '';
                        app.versions.forEach((v) => {
                            if (v.version === versionToCheck) {
                                deployedImage = v.deployedImageName || '';
                            }
                        });
                        if (!deployedImage)
                            continue;
                        if (repoTags.indexOf(deployedImage) >= 0) {
                            imageInUse = true;
                        }
                    }
                });
                if (!imageInUse) {
                    unusedImages.push({
                        id: currentImage.Id,
                        tags: repoTags,
                    });
                }
            }
            return unusedImages;
        });
    }
    deleteImages(imageIds) {
        Logger_1.default.d('Deleting images...');
        const dockerApi = this.dockerApi;
        return Promise.resolve().then(function () {
            return dockerApi.deleteImages(imageIds);
        });
    }
    createPreDeployFunctionIfExist(app) {
        let preDeployFunction = app.preDeployFunction;
        if (!preDeployFunction) {
            return undefined;
        }
        /*
        ////////////////////////////////// Expected content of the file //////////////////////////

            console.log('-------------------------------'+new Date());

            preDeployFunction = function (captainAppObj, dockerUpdateObject) {
                return Promise.resolve()
                        .then(function(){
                            console.log(JSON.stringify(dockerUpdateObject));
                            return dockerUpdateObject;
                        });
            };
         */
        preDeployFunction =
            preDeployFunction + '\n\n module.exports = preDeployFunction';
        return requireFromString(preDeployFunction);
    }
    ensureNotBuilding(appName) {
        if (this.activeOrScheduledBuilds[appName])
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_OPERATION, `Build in-progress for ${appName}. Please wait...`);
    }
    updateAppDefinition(appName, description, instanceCount, captainDefinitionRelativeFilePath, envVars, volumes, tags, nodeId, notExposeAsWebApp, containerHttpPort, httpAuth, forceSsl, ports, repoInfo, customNginxConfig, redirectDomain, preDeployFunction, serviceUpdateOverride, websocketSupport, appDeployTokenConfig) {
        const self = this;
        const dataStore = this.dataStore;
        const dockerApi = this.dockerApi;
        let serviceName;
        const checkIfNodeIdExists = function (nodeIdToCheck) {
            return dockerApi.getNodesInfo().then(function (nodeInfo) {
                for (let i = 0; i < nodeInfo.length; i++) {
                    if (nodeIdToCheck === nodeInfo[i].nodeId) {
                        return;
                    }
                }
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Node ID you requested is not part of the swarm cluster: ${nodeIdToCheck}`);
            });
        };
        return Promise.resolve()
            .then(function () {
            return self.ensureNotBuilding(appName);
        })
            .then(function () {
            return dataStore.getAppsDataStore().getAppDefinition(appName);
        })
            .then(function (app) {
            serviceName = dataStore
                .getAppsDataStore()
                .getServiceName(appName);
            // After leaving this block, nodeId will be guaranteed to be NonNull
            if (app.hasPersistentData) {
                if (nodeId) {
                    return checkIfNodeIdExists(nodeId);
                }
                else {
                    if (app.nodeId) {
                        nodeId = app.nodeId;
                    }
                    else {
                        return dockerApi
                            .isServiceRunningByName(serviceName)
                            .then(function (isRunning) {
                            if (!isRunning) {
                                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Cannot find the service. Try again in a minute...');
                            }
                            return dockerApi.getNodeIdByServiceName(serviceName, 0);
                        })
                            .then(function (nodeIdRunningService) {
                            if (!nodeIdRunningService) {
                                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'No NodeId was found. Try again in a minute...');
                            }
                            nodeId = nodeIdRunningService;
                        });
                    }
                }
            }
            else {
                if (volumes && volumes.length) {
                    throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_OPERATION, 'Cannot set volumes for a non-persistent container!');
                }
                if (nodeId) {
                    return checkIfNodeIdExists(nodeId);
                }
            }
        })
            .then(function () {
            serviceUpdateOverride = serviceUpdateOverride
                ? `${serviceUpdateOverride}`.trim()
                : '';
            if (!serviceUpdateOverride) {
                // no override!
                return;
            }
            if (!Utils_1.default.convertYamlOrJsonToObject(serviceUpdateOverride)) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, 'serviceUpdateOverride must be either a valid JSON object starting with { or an equivalent yaml');
            }
        })
            .then(function () {
            return dataStore
                .getAppsDataStore()
                .updateAppDefinitionInDb(appName, description, instanceCount, captainDefinitionRelativeFilePath, envVars, volumes, tags, nodeId, notExposeAsWebApp, containerHttpPort, httpAuth, forceSsl, ports, repoInfo, self.authenticator, customNginxConfig, redirectDomain, preDeployFunction, serviceUpdateOverride, websocketSupport, appDeployTokenConfig);
        })
            .then(function () {
            return self.ensureServiceInitedAndUpdated(appName);
        })
            .then(function () {
            return self.reloadLoadBalancer();
        });
    }
    isAppBuilding(appName) {
        return !!this.activeOrScheduledBuilds[appName];
    }
    /**
     *
     * @returns the active build that it finds
     */
    isAnyBuildRunning() {
        const activeBuilds = this.activeOrScheduledBuilds;
        for (const appName in activeBuilds) {
            if (activeBuilds[appName]) {
                return appName;
            }
        }
        return undefined;
    }
    getBuildStatus(appName) {
        const self = this;
        return {
            isAppBuilding: self.isAppBuilding(appName),
            logs: self.buildLogsManager.getAppBuildLogs(appName).getLogs(),
            isBuildFailed: self.buildLogsManager.getAppBuildLogs(appName).isBuildFailed,
        };
    }
    logBuildFailed(appName, error) {
        const self = this;
        error = (error || '') + '';
        self.eventLogger.trackEvent(ICapRoverEvent_1.CapRoverEventFactory.create(ICapRoverEvent_1.CapRoverEventType.AppBuildFailed, {
            appName,
            error: error.substring(0, 1000),
        }));
        this.buildLogsManager.getAppBuildLogs(appName).onBuildFailed(error);
    }
    getAppLogs(appName, encoding) {
        const serviceName = this.dataStore
            .getAppsDataStore()
            .getServiceName(appName);
        const dockerApi = this.dockerApi;
        return Promise.resolve() //
            .then(function () {
            return dockerApi.getLogForService(serviceName, CaptainConstants_1.default.configs.appLogSize, encoding);
        });
    }
    ensureServiceInitedAndUpdated(appName) {
        Logger_1.default.d(`Ensure service inited and Updated for: ${appName}`);
        const self = this;
        const serviceName = this.dataStore
            .getAppsDataStore()
            .getServiceName(appName);
        let imageName;
        const dockerApi = this.dockerApi;
        const dataStore = this.dataStore;
        let app;
        let dockerAuthObject;
        return Promise.resolve() //
            .then(function () {
            return dataStore.getAppsDataStore().getAppDefinition(appName);
        })
            .then(function (appFound) {
            app = appFound;
            Logger_1.default.d(`Check if service is running: ${serviceName}`);
            return dockerApi.isServiceRunningByName(serviceName);
        })
            .then(function (isRunning) {
            for (let i = 0; i < app.versions.length; i++) {
                const element = app.versions[i];
                if (element.version === app.deployedVersion) {
                    imageName = element.deployedImageName;
                    break;
                }
            }
            if (!imageName) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, 'ImageName for deployed version is not available, this version was probably failed due to an unsuccessful build!');
            }
            if (isRunning) {
                Logger_1.default.d(`Service is already running: ${serviceName}`);
                return true;
            }
            else {
                Logger_1.default.d(`Creating service ${serviceName} with default image, we will update image later`);
                // if we pass in networks here. Almost always it results in a delayed update which causes
                // update errors if they happen right away!
                return dockerApi
                    .createServiceOnNodeId(CaptainConstants_1.default.configs.appPlaceholderImageName, serviceName, undefined, undefined, undefined, undefined, undefined)
                    .then(() => true);
            }
        })
            .then(function () {
            return self.dockerRegistryHelper.getDockerAuthObjectForImageName(imageName);
        })
            .then(function (data) {
            dockerAuthObject = data;
        })
            .then(function () {
            return self.createPreDeployFunctionIfExist(app);
        })
            .then(function (preDeployFunction) {
            Logger_1.default.d(`Updating service ${serviceName} with image ${imageName}`);
            return dockerApi.updateService(serviceName, imageName, app.volumes, app.networks, app.envVars, undefined, dockerAuthObject, Number(app.instanceCount), app.nodeId, dataStore.getNameSpace(), app.ports, app, DockerApi_1.IDockerUpdateOrders.AUTO, Utils_1.default.convertYamlOrJsonToObject(app.serviceUpdateOverride), preDeployFunction);
        })
            .then(function () {
            return new Promise(function (resolve) {
                // Waiting 2 extra seconds for docker DNS to pickup the service name
                setTimeout(resolve, 2000);
            });
        })
            .then(function () {
            return self.reloadLoadBalancer();
        });
    }
    reloadLoadBalancer() {
        Logger_1.default.d('Updating Load Balancer - ServiceManager');
        const self = this;
        return self.loadBalancerManager.rePopulateNginxConfigFile(self.dataStore);
    }
}
exports.default = ServiceManager;
//# sourceMappingURL=ServiceManager.js.map