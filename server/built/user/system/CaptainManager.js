"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const DataStoreProvider_1 = require("../../datastore/DataStoreProvider");
const DockerApi_1 = require("../../docker/DockerApi");
const IRegistryInfo_1 = require("../../models/IRegistryInfo");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const Logger_1 = require("../../utils/Logger");
const MigrateCaptainDuckDuck_1 = require("../../utils/MigrateCaptainDuckDuck");
const Utils_1 = require("../../utils/Utils");
const Authenticator_1 = require("../Authenticator");
const FeatureFlags_1 = require("../FeatureFlags");
const ServiceManager_1 = require("../ServiceManager");
const EventLogger_1 = require("../events/EventLogger");
const ICapRoverEvent_1 = require("../events/ICapRoverEvent");
const ProManager_1 = require("../pro/ProManager");
const BackupManager_1 = require("./BackupManager");
const CertbotManager_1 = require("./CertbotManager");
const DomainResolveChecker_1 = require("./DomainResolveChecker");
const LoadBalancerManager_1 = require("./LoadBalancerManager");
const SelfHostedDockerRegistry_1 = require("./SelfHostedDockerRegistry");
const request = require("request");
const fs = require("fs-extra");
const DEBUG_SALT = 'THIS IS NOT A REAL CERTIFICATE';
const MAX_FAIL_ALLOWED = 4;
const HEALTH_CHECK_INTERVAL = 20000; // ms
const TIMEOUT_HEALTH_CHECK = 15000; // ms
class CaptainManager {
    constructor() {
        const dockerApi = DockerApi_1.default.get();
        this.hasForceSsl = false;
        this.dataStore = DataStoreProvider_1.default.getDataStore(CaptainConstants_1.default.rootNameSpace);
        this.dockerApi = dockerApi;
        this.certbotManager = new CertbotManager_1.default(dockerApi);
        this.loadBalancerManager = new LoadBalancerManager_1.default(dockerApi, this.certbotManager, this.dataStore);
        this.domainResolveChecker = new DomainResolveChecker_1.default(this.loadBalancerManager, this.certbotManager);
        this.myNodeId = undefined;
        this.inited = false;
        this.waitUntilRestarted = false;
        this.captainSalt = '';
        this.consecutiveHealthCheckFailCount = 0;
        this.healthCheckUuid = (0, uuid_1.v4)();
        this.backupManager = new BackupManager_1.default();
    }
    initialize() {
        // If a linked file / directory is deleted on the host, it loses the connection to
        // the container and needs an update to be picked up again.
        const self = this;
        const dataStore = this.dataStore;
        const dockerApi = this.dockerApi;
        const loadBalancerManager = this.loadBalancerManager;
        let myNodeId;
        self.refreshForceSslState()
            .then(function () {
            return dockerApi.getNodeIdByServiceName(CaptainConstants_1.default.captainServiceName, 0);
        })
            .then(function (nodeId) {
            myNodeId = nodeId;
            self.myNodeId = myNodeId;
            self.dockerRegistry = new SelfHostedDockerRegistry_1.default(self.dockerApi, self.dataStore, self.certbotManager, self.loadBalancerManager, self.myNodeId);
            return dockerApi.isNodeManager(myNodeId);
        })
            .then(function (isManager) {
            if (!isManager) {
                throw new Error('Captain should only run on a manager node');
            }
        })
            .then(function () {
            Logger_1.default.d('Emptying generated and temp folders.');
            return fs.emptyDir(CaptainConstants_1.default.captainRootDirectoryTemp);
        })
            .then(function () {
            return fs.emptyDir(CaptainConstants_1.default.captainRootDirectoryGenerated);
        })
            .then(function () {
            Logger_1.default.d('Ensuring directories are available on host. Started.');
            return fs.ensureDir(CaptainConstants_1.default.letsEncryptEtcPath);
        })
            .then(function () {
            return fs.ensureDir(CaptainConstants_1.default.letsEncryptLibPath);
        })
            .then(function () {
            return fs.ensureDir(CaptainConstants_1.default.captainStaticFilesDir);
        })
            .then(function () {
            return fs.ensureDir(CaptainConstants_1.default.perAppNginxConfigPathBase);
        })
            .then(function () {
            return fs.ensureFile(CaptainConstants_1.default.baseNginxConfigPath);
        })
            .then(function () {
            return fs.ensureDir(CaptainConstants_1.default.registryPathOnHost);
        })
            .then(function () {
            return dockerApi.ensureOverlayNetwork(CaptainConstants_1.default.captainNetworkName, CaptainConstants_1.default.configs.overlayNetworkOverride);
        })
            .then(function () {
            Logger_1.default.d('Ensuring directories are available on host. Finished.');
            return dockerApi.ensureServiceConnectedToNetwork(CaptainConstants_1.default.captainServiceName, CaptainConstants_1.default.captainNetworkName);
        })
            .then(function () {
            const valueIfNotExist = CaptainConstants_1.default.isDebug
                ? DEBUG_SALT
                : (0, uuid_1.v4)();
            return dockerApi.ensureSecret(CaptainConstants_1.default.captainSaltSecretKey, valueIfNotExist);
        })
            .then(function () {
            return dockerApi.ensureSecretOnService(CaptainConstants_1.default.captainServiceName, CaptainConstants_1.default.captainSaltSecretKey);
        })
            .then(function (secretHadExistedBefore) {
            if (!secretHadExistedBefore) {
                return new Promise(function () {
                    Logger_1.default.d('I am halting here. I expect to get restarted in a few seconds due to a secret (captain salt) being updated.');
                });
            }
        })
            .then(function () {
            const secretFileName = `/run/secrets/${CaptainConstants_1.default.captainSaltSecretKey}`;
            if (!fs.pathExistsSync(secretFileName)) {
                throw new Error(`Secret is attached according to Docker. But file cannot be found. ${secretFileName}`);
            }
            const secretContent = fs.readFileSync(secretFileName).toString();
            if (!secretContent) {
                throw new Error('Salt secret content is empty!');
            }
            self.captainSalt = secretContent;
            return true;
        })
            .then(function () {
            return Authenticator_1.default.setMainSalt(self.getCaptainSalt());
        })
            .then(function () {
            return dataStore.setEncryptionSalt(self.getCaptainSalt());
        })
            .then(function () {
            return new MigrateCaptainDuckDuck_1.default(dataStore, Authenticator_1.default.getAuthenticator(dataStore.getNameSpace()))
                .migrateIfNeeded()
                .then(function (migrationPerformed) {
                if (migrationPerformed) {
                    return self.resetSelf();
                }
            });
        })
            .then(function () {
            return loadBalancerManager.init(myNodeId, dataStore);
        })
            .then(function () {
            return dataStore.getRegistriesDataStore().getAllRegistries();
        })
            .then(function (registries) {
            let localRegistry = undefined;
            for (let idx = 0; idx < registries.length; idx++) {
                const element = registries[idx];
                if (element.registryType === IRegistryInfo_1.IRegistryTypes.LOCAL_REG) {
                    localRegistry = element;
                }
            }
            if (localRegistry) {
                Logger_1.default.d('Ensuring Docker Registry is running...');
                return self.dockerRegistry.ensureDockerRegistryRunningOnThisNode(localRegistry.registryPassword);
            }
            return Promise.resolve(true);
        })
            .then(function () {
            return self.backupManager.startRestorationIfNeededPhase2(self.getCaptainSalt(), () => {
                return self.ensureAllAppsInited();
            });
        })
            .then(function () {
            self.inited = true;
            self.performHealthCheck();
            EventLogger_1.EventLoggerFactory.get(new ProManager_1.default(self.dataStore.getProDataStore(), FeatureFlags_1.default.get(self.dataStore)))
                .getLogger()
                .trackEvent(ICapRoverEvent_1.CapRoverEventFactory.create(ICapRoverEvent_1.CapRoverEventType.InstanceStarted, {}));
            Logger_1.default.d('**** Captain is initialized and ready to serve you! ****');
        })
            .catch(function (error) {
            Logger_1.default.e(error);
            setTimeout(function () {
                process.exit(0);
            }, 5000);
        });
    }
    getDomainResolveChecker() {
        return this.domainResolveChecker;
    }
    performHealthCheck() {
        const self = this;
        const captainPublicDomain = `${CaptainConstants_1.default.configs.captainSubDomain}.${self.dataStore.getRootDomain()}`;
        function scheduleNextHealthCheck() {
            self.healthCheckUuid = (0, uuid_1.v4)();
            setTimeout(function () {
                self.performHealthCheck();
            }, HEALTH_CHECK_INTERVAL);
        }
        // For debug build, we'll turn off health check
        if (CaptainConstants_1.default.isDebug || !self.dataStore.hasCustomDomain()) {
            scheduleNextHealthCheck();
            return;
        }
        function checkCaptainHealth(callback) {
            let callbackCalled = false;
            setTimeout(function () {
                if (callbackCalled) {
                    return;
                }
                callbackCalled = true;
                callback(false);
            }, TIMEOUT_HEALTH_CHECK);
            if (CaptainConstants_1.default.configs.skipVerifyingDomains) {
                setTimeout(function () {
                    if (callbackCalled) {
                        return;
                    }
                    callbackCalled = true;
                    callback(true);
                }, 10);
                return;
            }
            const url = `http://${captainPublicDomain}${CaptainConstants_1.default.healthCheckEndPoint}`;
            request(url, function (error, response, body) {
                if (callbackCalled) {
                    return;
                }
                callbackCalled = true;
                if (error || !body || body !== self.getHealthCheckUuid()) {
                    callback(false);
                }
                else {
                    callback(true);
                }
            });
        }
        function checkNginxHealth(callback) {
            let callbackCalled = false;
            setTimeout(function () {
                if (callbackCalled) {
                    return;
                }
                callbackCalled = true;
                callback(false);
            }, TIMEOUT_HEALTH_CHECK);
            self.domainResolveChecker
                .verifyCaptainOwnsDomainOrThrow(captainPublicDomain, '-healthcheck')
                .then(function () {
                if (callbackCalled) {
                    return;
                }
                callbackCalled = true;
                callback(true);
            })
                .catch(function () {
                if (callbackCalled) {
                    return;
                }
                callbackCalled = true;
                callback(false);
            });
        }
        const checksPerformed = {};
        function scheduleIfNecessary() {
            if (!checksPerformed.captainHealth ||
                !checksPerformed.nginxHealth) {
                return;
            }
            let hasFailedCheck = false;
            if (!checksPerformed.captainHealth.value) {
                Logger_1.default.w(`Captain health check failed: #${self.consecutiveHealthCheckFailCount} at ${captainPublicDomain}`);
                hasFailedCheck = true;
            }
            if (!checksPerformed.nginxHealth.value) {
                Logger_1.default.w(`NGINX health check failed: #${self.consecutiveHealthCheckFailCount}`);
                hasFailedCheck = true;
            }
            if (hasFailedCheck) {
                self.consecutiveHealthCheckFailCount =
                    self.consecutiveHealthCheckFailCount + 1;
            }
            else {
                self.consecutiveHealthCheckFailCount = 0;
            }
            scheduleNextHealthCheck();
            if (self.consecutiveHealthCheckFailCount > MAX_FAIL_ALLOWED) {
                process.exit(1);
            }
        }
        checkCaptainHealth(function (success) {
            checksPerformed.captainHealth = {
                value: success,
            };
            scheduleIfNecessary();
        });
        checkNginxHealth(function (success) {
            checksPerformed.nginxHealth = {
                value: success,
            };
            scheduleIfNecessary();
        });
    }
    getHealthCheckUuid() {
        return this.healthCheckUuid;
    }
    getBackupManager() {
        return this.backupManager;
    }
    getCertbotManager() {
        return this.certbotManager;
    }
    isInitialized() {
        return (this.inited &&
            !this.waitUntilRestarted &&
            !this.backupManager.isRunning());
    }
    ensureAllAppsInited() {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            return self.dataStore.getAppsDataStore().getAppDefinitions();
        })
            .then(function (apps) {
            const promises = [];
            const serviceManager = ServiceManager_1.default.get(self.dataStore.getNameSpace(), Authenticator_1.default.getAuthenticator(self.dataStore.getNameSpace()), self.dataStore, self.dockerApi, CaptainManager.get().getLoadBalanceManager(), EventLogger_1.EventLoggerFactory.get(new ProManager_1.default(self.dataStore.getProDataStore(), FeatureFlags_1.default.get(self.dataStore))).getLogger(), CaptainManager.get().getDomainResolveChecker());
            Object.keys(apps).forEach((appName) => {
                promises.push(function () {
                    return Promise.resolve() //
                        .then(function () {
                        return serviceManager.ensureServiceInitedAndUpdated(appName);
                    })
                        .then(function () {
                        Logger_1.default.d(`Waiting 5 second for the service to settle... ${appName}`);
                        return Utils_1.default.getDelayedPromise(5000);
                    });
                });
            });
            return Utils_1.default.runPromises(promises);
        });
    }
    getMyNodeId() {
        if (!this.myNodeId) {
            const msg = 'myNodeId is not set yet!!';
            Logger_1.default.e(msg);
            throw new Error(msg);
        }
        return this.myNodeId;
    }
    getCaptainSalt() {
        if (!this.captainSalt) {
            const msg = 'Captain Salt is not set yet!!';
            Logger_1.default.e(msg);
            throw new Error(msg);
        }
        return this.captainSalt;
    }
    updateNetDataInfo(netDataInfo) {
        const self = this;
        const dockerApi = this.dockerApi;
        return Promise.resolve()
            .then(function () {
            return dockerApi.ensureContainerStoppedAndRemoved(CaptainConstants_1.default.netDataContainerName, CaptainConstants_1.default.captainNetworkName);
        })
            .then(function () {
            if (netDataInfo.isEnabled) {
                const vols = [
                    {
                        hostPath: '/proc',
                        containerPath: '/host/proc',
                        mode: 'ro',
                    },
                    {
                        hostPath: '/sys',
                        containerPath: '/host/sys',
                        mode: 'ro',
                    },
                    {
                        hostPath: '/var/run/docker.sock',
                        containerPath: '/var/run/docker.sock',
                    },
                ];
                const envVars = [];
                if (netDataInfo.data.smtp) {
                    envVars.push({
                        key: 'SSMTP_TO',
                        value: netDataInfo.data.smtp.to,
                    });
                    envVars.push({
                        key: 'SSMTP_HOSTNAME',
                        value: netDataInfo.data.smtp.hostname,
                    });
                    envVars.push({
                        key: 'SSMTP_SERVER',
                        value: netDataInfo.data.smtp.server,
                    });
                    envVars.push({
                        key: 'SSMTP_PORT',
                        value: netDataInfo.data.smtp.port,
                    });
                    envVars.push({
                        key: 'SSMTP_TLS',
                        value: netDataInfo.data.smtp.allowNonTls
                            ? 'NO'
                            : 'YES',
                    });
                    envVars.push({
                        key: 'SSMTP_USER',
                        value: netDataInfo.data.smtp.username,
                    });
                    envVars.push({
                        key: 'SSMTP_PASS',
                        value: netDataInfo.data.smtp.password,
                    });
                    // See: https://github.com/titpetric/netdata#changelog
                    const otherEnvVars = [];
                    envVars.forEach((e) => {
                        otherEnvVars.push({
                            // change SSMTP to SMTP
                            key: e.key.replace('SSMTP_', 'SMTP_'),
                            value: e.value,
                        });
                    });
                    envVars.push(...otherEnvVars);
                    envVars.push({
                        key: 'SMTP_STARTTLS',
                        value: netDataInfo.data.smtp.allowNonTls
                            ? ''
                            : 'on',
                    });
                }
                if (netDataInfo.data.slack) {
                    envVars.push({
                        key: 'SLACK_WEBHOOK_URL',
                        value: netDataInfo.data.slack.hook,
                    });
                    envVars.push({
                        key: 'SLACK_CHANNEL',
                        value: netDataInfo.data.slack.channel,
                    });
                }
                if (netDataInfo.data.telegram) {
                    envVars.push({
                        key: 'TELEGRAM_BOT_TOKEN',
                        value: netDataInfo.data.telegram.botToken,
                    });
                    envVars.push({
                        key: 'TELEGRAM_CHAT_ID',
                        value: netDataInfo.data.telegram.chatId,
                    });
                }
                if (netDataInfo.data.pushBullet) {
                    envVars.push({
                        key: 'PUSHBULLET_ACCESS_TOKEN',
                        value: netDataInfo.data.pushBullet.apiToken,
                    });
                    envVars.push({
                        key: 'PUSHBULLET_DEFAULT_EMAIL',
                        value: netDataInfo.data.pushBullet.fallbackEmail,
                    });
                }
                return dockerApi.createStickyContainer(CaptainConstants_1.default.netDataContainerName, CaptainConstants_1.default.configs.netDataImageName, vols, CaptainConstants_1.default.captainNetworkName, envVars, ['SYS_PTRACE'], ['apparmor:unconfined'], undefined);
            }
            // Just removing the old container. No need to create a new one.
            return true;
        })
            .then(function () {
            return self.dataStore.setNetDataInfo(netDataInfo);
        });
    }
    getNodesInfo() {
        const dockerApi = this.dockerApi;
        return Promise.resolve()
            .then(function () {
            return dockerApi.getNodesInfo();
        })
            .then(function (data) {
            if (!data || !data.length) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'No cluster node was found!');
            }
            return data;
        });
    }
    getLoadBalanceManager() {
        return this.loadBalancerManager;
    }
    getDockerRegistry() {
        return this.dockerRegistry;
    }
    enableSsl(emailAddress) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.certbotManager.ensureRegistered(emailAddress);
        })
            .then(function () {
            return self.certbotManager.enableSsl(`${CaptainConstants_1.default.configs.captainSubDomain}.${self.dataStore.getRootDomain()}`);
        })
            .then(function () {
            return self.dataStore.setUserEmailAddress(emailAddress);
        })
            .then(function () {
            return self.dataStore.setHasRootSsl(true);
        })
            .then(function () {
            Logger_1.default.d('Updating Load Balancer - CaptainManager.enableSsl');
            return self.loadBalancerManager.rePopulateNginxConfigFile(self.dataStore);
        });
    }
    forceSsl(isEnabled) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.dataStore.getHasRootSsl();
        })
            .then(function (hasRootSsl) {
            if (!hasRootSsl && isEnabled) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'You first need to enable SSL on the root domain before forcing it.');
            }
            return self.dataStore.setForceSsl(isEnabled);
        })
            .then(function () {
            return self.refreshForceSslState();
        });
    }
    refreshForceSslState() {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.dataStore.getForceSsl();
        })
            .then(function (hasForceSsl) {
            self.hasForceSsl = hasForceSsl;
        });
    }
    getForceSslValue() {
        return !!this.hasForceSsl;
    }
    getNginxConfig() {
        const self = this;
        return Promise.resolve().then(function () {
            return self.dataStore.getNginxConfig();
        });
    }
    setNginxConfig(baseConfig, captainConfig) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.dataStore.setNginxConfig(baseConfig, captainConfig);
        })
            .then(function () {
            self.resetSelf();
        });
    }
    changeCaptainRootDomain(requestedCustomDomain, force) {
        const self = this;
        // Some DNS servers do not allow wild cards. Therefore this line may fail.
        // We still allow users to specify the domains in their DNS settings individually
        // SubDomains that need to be added are "captain." "registry." "app-name."
        const url = `${(0, uuid_1.v4)()}.${requestedCustomDomain}:${CaptainConstants_1.default.nginxPortNumber}`;
        return self.domainResolveChecker
            .verifyDomainResolvesToDefaultServerOnHost(url)
            .then(function () {
            return self.dataStore.getHasRootSsl();
        })
            .then(function (hasRootSsl) {
            if (!force &&
                hasRootSsl &&
                self.dataStore.getRootDomain() !== requestedCustomDomain) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'SSL is enabled for root. You can still force change the root domain, but read docs for consequences!');
            }
            if (force) {
                return self
                    .forceSsl(false)
                    .then(function () {
                    return self.dataStore.setHasRootSsl(false);
                })
                    .then(function () {
                    return self.dataStore
                        .getAppsDataStore()
                        .ensureAllAppsSubDomainSslDisabled();
                });
            }
        })
            .then(function () {
            return self.dataStore
                .getRegistriesDataStore()
                .getAllRegistries();
        })
            .then(function (registries) {
            let localRegistry = undefined;
            for (let idx = 0; idx < registries.length; idx++) {
                const element = registries[idx];
                if (element.registryType === IRegistryInfo_1.IRegistryTypes.LOCAL_REG) {
                    localRegistry = element;
                }
            }
            if (localRegistry) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_OPERATION, 'Delete your self-hosted Docker registry before changing the domain.');
            }
            return Promise.resolve(true);
        })
            .then(function () {
            return self.dataStore.setCustomDomain(requestedCustomDomain);
        })
            .then(function () {
            Logger_1.default.d('Updating Load Balancer - CaptainManager.changeCaptainRootDomain');
            return self.loadBalancerManager.rePopulateNginxConfigFile(self.dataStore);
        });
    }
    resetSelf() {
        const self = this;
        Logger_1.default.d('Captain is resetting itself!');
        self.waitUntilRestarted = true;
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                return self.dockerApi.updateService(CaptainConstants_1.default.captainServiceName, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
            }, 2000);
        });
    }
    static get() {
        if (!CaptainManager.captainManagerInstance) {
            CaptainManager.captainManagerInstance = new CaptainManager();
        }
        return CaptainManager.captainManagerInstance;
    }
}
exports.default = CaptainManager;
//# sourceMappingURL=CaptainManager.js.map