"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const Logger_1 = require("../../utils/Logger");
const fs = require("fs-extra");
const bcrypt = require("bcryptjs");
class SelfHostedDockerRegistry {
    constructor(dockerApi, dataStore, certbotManager, loadBalancerManager, myNodeId) {
        this.dockerApi = dockerApi;
        this.dataStore = dataStore;
        this.certbotManager = certbotManager;
        this.loadBalancerManager = loadBalancerManager;
        this.myNodeId = myNodeId;
        //
    }
    enableRegistrySsl() {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.dataStore.getHasRootSsl();
        })
            .then(function (rootHasSsl) {
            if (!rootHasSsl) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_OPERATION, 'Root must have SSL before enabling ssl for docker registry.');
            }
            return self.certbotManager.enableSsl(`${CaptainConstants_1.default.registrySubDomain}.${self.dataStore.getRootDomain()}`);
        })
            .then(function () {
            return self.dataStore.setHasRegistrySsl(true);
        })
            .then(function () {
            Logger_1.default.d('Updating Load Balancer - SelfHostedDockerRegistry.enableRegistrySsl');
            return self.loadBalancerManager.rePopulateNginxConfigFile(self.dataStore);
        });
    }
    getLocalRegistryDomainAndPort() {
        const self = this;
        return `${CaptainConstants_1.default.registrySubDomain}.${self.dataStore.getRootDomain()}:${CaptainConstants_1.default.configs.registrySubDomainPort}`;
    }
    ensureServiceRemoved() {
        const dockerApi = this.dockerApi;
        const self = this;
        return Promise.resolve() //
            .then(function () {
            return self.dataStore.setHasRegistrySsl(false);
        })
            .then(function () {
            return dockerApi.isServiceRunningByName(CaptainConstants_1.default.registryServiceName);
        })
            .then(function (isRunning) {
            if (!isRunning)
                return;
            return dockerApi.removeServiceByName(CaptainConstants_1.default.registryServiceName);
        });
    }
    ensureDockerRegistryRunningOnThisNode(password) {
        const dockerApi = this.dockerApi;
        const dataStore = this.dataStore;
        function createRegistryServiceOnNode(nodeId) {
            return dockerApi
                .createServiceOnNodeId(CaptainConstants_1.default.configs.registryImageName, CaptainConstants_1.default.registryServiceName, undefined, nodeId, undefined, [
                {
                    key: 'REGISTRY_STORAGE_DELETE_ENABLED',
                    value: 'true',
                },
            ], undefined)
                .then(function () {
                const waitTimeInMillis = 5000;
                Logger_1.default.d(`Waiting for ${waitTimeInMillis / 1000} seconds for Registry to start up`);
                return new Promise(function (resolve, reject) {
                    setTimeout(function () {
                        resolve(true);
                    }, waitTimeInMillis);
                });
            });
        }
        const myNodeId = this.myNodeId;
        return Promise.resolve()
            .then(function () {
            const authContent = `${CaptainConstants_1.default.captainRegistryUsername}:${bcrypt.hashSync(password, bcrypt.genSaltSync(10))}`;
            return fs.outputFile(CaptainConstants_1.default.registryAuthPathOnHost, authContent);
        })
            .then(function () {
            return dockerApi.isServiceRunningByName(CaptainConstants_1.default.registryServiceName);
        })
            .then(function (isRunning) {
            if (isRunning) {
                Logger_1.default.d('Captain Registry is already running.. ');
                return dockerApi.getNodeIdByServiceName(CaptainConstants_1.default.registryServiceName, 0);
            }
            else {
                Logger_1.default.d('No Captain Registry service is running. Creating one...');
                return createRegistryServiceOnNode(myNodeId).then(function () {
                    return myNodeId;
                });
            }
        })
            .then(function (nodeId) {
            if (nodeId !== myNodeId) {
                Logger_1.default.d('Captain Registry is running on a different node. Removing...');
                return dockerApi
                    .removeServiceByName(CaptainConstants_1.default.registryServiceName)
                    .then(function () {
                    Logger_1.default.d('Creating Registry on this node...');
                    return createRegistryServiceOnNode(myNodeId).then(function () {
                        return true;
                    });
                });
            }
            else {
                return true;
            }
        })
            .then(function () {
            Logger_1.default.d('Updating Certbot service...');
            return dockerApi.updateService(CaptainConstants_1.default.registryServiceName, CaptainConstants_1.default.configs.registryImageName, [
                {
                    containerPath: '/cert-files',
                    hostPath: CaptainConstants_1.default.letsEncryptEtcPath,
                },
                {
                    containerPath: '/var/lib/registry',
                    hostPath: CaptainConstants_1.default.registryPathOnHost,
                },
                {
                    containerPath: '/etc/auth',
                    hostPath: CaptainConstants_1.default.registryAuthPathOnHost,
                },
            ], 
            // No need for registry to be connected to the network
            undefined, [
                {
                    key: 'REGISTRY_HTTP_TLS_CERTIFICATE',
                    value: `/cert-files/live/${CaptainConstants_1.default.registrySubDomain}.${dataStore.getRootDomain()}/fullchain.pem`,
                },
                {
                    key: 'REGISTRY_HTTP_TLS_KEY',
                    value: `/cert-files/live/${CaptainConstants_1.default.registrySubDomain}.${dataStore.getRootDomain()}/privkey.pem`,
                },
                {
                    key: 'REGISTRY_AUTH',
                    value: 'htpasswd',
                },
                {
                    key: 'REGISTRY_AUTH_HTPASSWD_REALM',
                    value: 'Registry Realm',
                },
                {
                    key: 'REGISTRY_AUTH_HTPASSWD_PATH',
                    value: '/etc/auth',
                },
                {
                    key: 'REGISTRY_STORAGE_DELETE_ENABLED',
                    value: 'true',
                },
            ], undefined, undefined, undefined, undefined, undefined, [
                {
                    protocol: 'tcp',
                    containerPort: 5000,
                    hostPort: CaptainConstants_1.default.configs.registrySubDomainPort,
                },
            ], undefined, undefined, undefined, undefined);
        });
    }
}
exports.default = SelfHostedDockerRegistry;
//# sourceMappingURL=SelfHostedDockerRegistry.js.map