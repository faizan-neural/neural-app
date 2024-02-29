"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ejs = require("ejs");
const chileProcess = require("child_process");
const path = require("path");
const util = require("util");
const uuid_1 = require("uuid");
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const LoadBalancerInfo_1 = require("../../models/LoadBalancerInfo");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const Logger_1 = require("../../utils/Logger");
const fs = require("fs-extra");
const request = require("request");
const exec = util.promisify(chileProcess.exec);
const defaultPageTemplate = fs
    .readFileSync(__dirname + '/../../../template/default-page.ejs')
    .toString();
const CONTAINER_PATH_OF_CONFIG = '/etc/nginx/conf.d';
const NGINX_CONTAINER_PATH_OF_FAKE_CERTS = '/etc/nginx/fake-certs';
const CAPROVER_CONTAINER_PATH_OF_FAKE_CERTS = __dirname + '/../../../template/fake-certs-src';
const HOST_PATH_OF_FAKE_CERTS = CaptainConstants_1.default.captainRootDirectoryGenerated +
    '/nginx/fake-certs-self-signed';
if (!fs.existsSync(CAPROVER_CONTAINER_PATH_OF_FAKE_CERTS))
    throw new Error('CAPROVER_CONTAINER_PATH_OF_FAKE_CERTS  is empty');
if (!defaultPageTemplate)
    throw new Error('defaultPageTemplate  is empty');
const DH_PARAMS_FILE_PATH_ON_HOST = path.join(CaptainConstants_1.default.nginxSharedPathOnHost, CaptainConstants_1.default.nginxDhParamFileName);
const DH_PARAMS_FILE_PATH_ON_NGINX = path.join(CaptainConstants_1.default.nginxSharedPathOnNginx, CaptainConstants_1.default.nginxDhParamFileName);
class LoadBalancerManager {
    constructor(dockerApi, certbotManager, dataStore) {
        this.dockerApi = dockerApi;
        this.certbotManager = certbotManager;
        this.dataStore = dataStore;
        this.reloadInProcess = false;
        this.requestedReloadPromises = [];
        this.captainPublicRandomKey = (0, uuid_1.v4)();
    }
    /**
     * Reloads the configuation for NGINX.
     * NOTE that this can return synchronously with UNDEFINED if there is already a process in the background.
     * @param dataStoreToQueue
     * @returns {Promise.<>}
     */
    rePopulateNginxConfigFile(dataStoreToQueue, noReload) {
        const self = this;
        return new Promise(function (res, rej) {
            self.requestedReloadPromises.push({
                dataStore: dataStoreToQueue,
                resolve: res,
                reject: rej,
            });
            self.consumeQueueIfAnyInNginxReloadQueue();
        }).then(function () {
            if (noReload)
                return;
            Logger_1.default.d('sendReloadSignal...');
            return self.dockerApi.sendSingleContainerKillHUP(CaptainConstants_1.default.nginxServiceName);
        });
    }
    consumeQueueIfAnyInNginxReloadQueue() {
        const self = this;
        const q = self.requestedReloadPromises.pop();
        if (!q) {
            return;
        }
        if (self.reloadInProcess) {
            Logger_1.default.d('NGINX Reload already in process, Bouncing off...');
            return;
        }
        Logger_1.default.d('Locking NGINX configuration reloading...');
        self.reloadInProcess = true;
        const dataStore = q.dataStore;
        // This will resolve to something like: /captain/nginx/conf.d/captain
        const configFilePathBase = `${CaptainConstants_1.default.perAppNginxConfigPathBase}/${dataStore.getNameSpace()}`;
        const FUTURE = configFilePathBase + '.fut';
        const BACKUP = configFilePathBase + '.bak';
        const CONFIG = configFilePathBase + '.conf';
        let nginxConfigContent = '';
        return Promise.resolve()
            .then(function () {
            return fs.remove(FUTURE);
        })
            .then(function () {
            return self.getServerList(dataStore);
        })
            .then(function (servers) {
            const promises = [];
            if (servers && !!servers.length) {
                for (let i = 0; i < servers.length; i++) {
                    const s = servers[i];
                    if (s.hasSsl) {
                        s.crtPath = self.getSslCertPath(s.publicDomain);
                        s.keyPath = self.getSslKeyPath(s.publicDomain);
                    }
                    s.staticWebRoot = `${CaptainConstants_1.default.nginxStaticRootDir +
                        CaptainConstants_1.default.nginxDomainSpecificHtmlDir}/${s.publicDomain}`;
                    s.customErrorPagesDirectory =
                        CaptainConstants_1.default.nginxStaticRootDir +
                            CaptainConstants_1.default.nginxDefaultHtmlDir;
                    const pathOfAuthInHost = `${configFilePathBase}-${s.publicDomain}.auth`;
                    promises.push(Promise.resolve()
                        .then(function () {
                        if (s.httpBasicAuth) {
                            s.httpBasicAuthPath = path.join(CONTAINER_PATH_OF_CONFIG, path.basename(pathOfAuthInHost));
                            return fs.outputFile(pathOfAuthInHost, s.httpBasicAuth);
                        }
                    })
                        .then(function () {
                        return ejs.render(s.nginxConfigTemplate, {
                            s: s,
                        });
                    })
                        .then(function (rendered) {
                        nginxConfigContent += rendered;
                    }));
                }
            }
            return Promise.all(promises);
        })
            .then(function () {
            return fs.outputFile(FUTURE, nginxConfigContent);
        })
            .then(function () {
            return fs.remove(BACKUP);
        })
            .then(function () {
            return fs.ensureFile(CONFIG);
        })
            .then(function () {
            return fs.renameSync(CONFIG, BACKUP); // sync method. It's really fast.
        })
            .then(function () {
            return fs.renameSync(FUTURE, CONFIG); // sync method. It's really fast.
        })
            .then(function () {
            return self.ensureBaseNginxConf();
        })
            .then(function () {
            return self.createRootConfFile(dataStore);
        })
            .then(function () {
            Logger_1.default.d('SUCCESS: UNLocking NGINX configuration reloading...');
            self.reloadInProcess = false;
            q.resolve();
            self.consumeQueueIfAnyInNginxReloadQueue();
        })
            .catch(function (error) {
            Logger_1.default.e(error);
            Logger_1.default.d('Error: UNLocking NGINX configuration reloading...');
            self.reloadInProcess = false;
            q.reject(error);
            self.consumeQueueIfAnyInNginxReloadQueue();
        });
    }
    getServerList(dataStore) {
        const self = this;
        let hasRootSsl;
        let rootDomain;
        return Promise.resolve()
            .then(function () {
            return dataStore.getHasRootSsl();
        })
            .then(function (val) {
            hasRootSsl = val;
            return dataStore.getRootDomain();
        })
            .then(function (val) {
            rootDomain = val;
        })
            .then(function () {
            return dataStore.getDefaultAppNginxConfig();
        })
            .then(function (defaultAppNginxConfig) {
            return self.getAppsServerConfig(dataStore, defaultAppNginxConfig, hasRootSsl, rootDomain);
        });
    }
    getAppsServerConfig(dataStore, defaultAppNginxConfig, hasRootSsl, rootDomain) {
        const servers = [];
        return dataStore
            .getAppsDataStore()
            .getAppDefinitions()
            .then(function (apps) {
            Object.keys(apps).forEach(function (appName) {
                const webApp = apps[appName];
                const httpBasicAuth = webApp.httpAuth && webApp.httpAuth.passwordHashed //
                    ? `${webApp.httpAuth.user}:${webApp.httpAuth.passwordHashed}`
                    : '';
                if (webApp.notExposeAsWebApp) {
                    return;
                }
                const localDomain = dataStore
                    .getAppsDataStore()
                    .getServiceName(appName);
                const forceSsl = !!webApp.forceSsl;
                const websocketSupport = !!webApp.websocketSupport;
                const nginxConfigTemplate = webApp.customNginxConfig || defaultAppNginxConfig;
                const serverWithSubDomain = {};
                serverWithSubDomain.hasSsl =
                    hasRootSsl && webApp.hasDefaultSubDomainSsl;
                serverWithSubDomain.publicDomain = `${appName}.${rootDomain}`;
                serverWithSubDomain.localDomain = localDomain;
                serverWithSubDomain.forceSsl = forceSsl;
                serverWithSubDomain.websocketSupport = websocketSupport;
                const httpPort = webApp.containerHttpPort || 80;
                serverWithSubDomain.containerHttpPort = httpPort;
                serverWithSubDomain.nginxConfigTemplate =
                    nginxConfigTemplate;
                serverWithSubDomain.httpBasicAuth = httpBasicAuth;
                if (webApp.redirectDomain &&
                    serverWithSubDomain.publicDomain !==
                        webApp.redirectDomain) {
                    serverWithSubDomain.redirectToPath = `http://${webApp.redirectDomain}`;
                }
                servers.push(serverWithSubDomain);
                // adding custom domains
                const customDomainArray = webApp.customDomain;
                if (customDomainArray && customDomainArray.length > 0) {
                    for (let idx = 0; idx < customDomainArray.length; idx++) {
                        const d = customDomainArray[idx];
                        const newServerBlock = {
                            containerHttpPort: httpPort,
                            hasSsl: d.hasSsl,
                            forceSsl: forceSsl,
                            websocketSupport: websocketSupport,
                            publicDomain: d.publicDomain,
                            localDomain: localDomain,
                            nginxConfigTemplate: nginxConfigTemplate,
                            staticWebRoot: '',
                            customErrorPagesDirectory: '',
                            httpBasicAuth: httpBasicAuth,
                        };
                        if (webApp.redirectDomain &&
                            newServerBlock.publicDomain !==
                                webApp.redirectDomain) {
                            newServerBlock.redirectToPath = `http://${webApp.redirectDomain}`;
                        }
                        servers.push(newServerBlock);
                    }
                }
            });
            return servers;
        });
    }
    getCaptainPublicRandomKey() {
        return this.captainPublicRandomKey;
    }
    getSslCertPath(domainName) {
        const self = this;
        return (CaptainConstants_1.default.letsEncryptEtcPathOnNginx +
            self.certbotManager.getCertRelativePathForDomain(domainName));
    }
    getSslKeyPath(domainName) {
        const self = this;
        return (CaptainConstants_1.default.letsEncryptEtcPathOnNginx +
            self.certbotManager.getKeyRelativePathForDomain(domainName));
    }
    getInfo() {
        return new Promise(function (resolve, reject) {
            const url = `http://${CaptainConstants_1.default.nginxServiceName}/nginx_status`;
            request(url, function (error, response, body) {
                if (error || !body) {
                    Logger_1.default.e(`Error        ${error}`);
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Request to nginx Failed.'));
                    return;
                }
                try {
                    const data = new LoadBalancerInfo_1.default();
                    const lines = body.split('\n');
                    data.activeConnections = Number(lines[0].split(' ')[2].trim());
                    data.accepted = Number(lines[2].split(' ')[1].trim());
                    data.handled = Number(lines[2].split(' ')[2].trim());
                    data.total = Number(lines[2].split(' ')[3].trim());
                    data.reading = Number(lines[3].split(' ')[1].trim());
                    data.writing = Number(lines[3].split(' ')[3].trim());
                    data.waiting = Number(lines[3].split(' ')[5].trim());
                    resolve(data);
                }
                catch (error) {
                    Logger_1.default.e(error);
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Parser Failed. See internal logs...'));
                }
            });
        });
    }
    createRootConfFile(dataStore) {
        const self = this;
        const captainDomain = `${CaptainConstants_1.default.configs.captainSubDomain}.${dataStore.getRootDomain()}`;
        const registryDomain = `${CaptainConstants_1.default.registrySubDomain}.${dataStore.getRootDomain()}`;
        let hasRootSsl = false;
        const FUTURE = CaptainConstants_1.default.rootNginxConfigPath + '.fut';
        const BACKUP = CaptainConstants_1.default.rootNginxConfigPath + '.bak';
        const CONFIG = CaptainConstants_1.default.rootNginxConfigPath + '.conf';
        let rootNginxTemplate = undefined;
        return Promise.resolve()
            .then(function () {
            return dataStore.getNginxConfig();
        })
            .then(function (nginxConfig) {
            rootNginxTemplate =
                nginxConfig.captainConfig.customValue ||
                    nginxConfig.captainConfig.byDefault;
            return dataStore.getHasRootSsl();
        })
            .then(function (hasSsl) {
            hasRootSsl = hasSsl;
            return dataStore.getHasRegistrySsl();
        })
            .then(function (hasRegistrySsl) {
            return ejs.render(rootNginxTemplate, {
                fake: {
                    crtPath: path.join(NGINX_CONTAINER_PATH_OF_FAKE_CERTS, 'nginx.crt'),
                    keyPath: path.join(NGINX_CONTAINER_PATH_OF_FAKE_CERTS, 'nginx.key'),
                },
                captain: {
                    crtPath: self.getSslCertPath(captainDomain),
                    keyPath: self.getSslKeyPath(captainDomain),
                    hasRootSsl: hasRootSsl,
                    serviceName: CaptainConstants_1.default.captainServiceName,
                    domain: captainDomain,
                    serviceExposedPort: CaptainConstants_1.default.captainServiceExposedPort,
                    defaultHtmlDir: CaptainConstants_1.default.nginxStaticRootDir +
                        CaptainConstants_1.default.nginxDefaultHtmlDir,
                    staticWebRoot: `${CaptainConstants_1.default.nginxStaticRootDir +
                        CaptainConstants_1.default.nginxDomainSpecificHtmlDir}/${captainDomain}`,
                },
                registry: {
                    crtPath: self.getSslCertPath(registryDomain),
                    keyPath: self.getSslKeyPath(registryDomain),
                    hasRootSsl: hasRegistrySsl,
                    domain: registryDomain,
                    staticWebRoot: `${CaptainConstants_1.default.nginxStaticRootDir +
                        CaptainConstants_1.default.nginxDomainSpecificHtmlDir}/${registryDomain}`,
                },
            });
        })
            .then(function (rootNginxConfContent) {
            return fs.outputFile(FUTURE, rootNginxConfContent);
        })
            .then(function () {
            return fs.remove(BACKUP);
        })
            .then(function () {
            return fs.ensureFile(CONFIG);
        })
            .then(function () {
            return fs.renameSync(CONFIG, BACKUP); // sync method. It's really fast.
        })
            .then(function () {
            return fs.renameSync(FUTURE, CONFIG); // sync method. It's really fast.
        });
    }
    ensureBaseNginxConf() {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.dataStore.getNginxConfig();
        })
            .then(function (captainConfig) {
            const baseConfigTemplate = captainConfig.baseConfig.customValue ||
                captainConfig.baseConfig.byDefault;
            return ejs.render(baseConfigTemplate, {
                base: {
                    dhparamsFilePath: fs.existsSync(DH_PARAMS_FILE_PATH_ON_HOST) &&
                        fs
                            .readFileSync(DH_PARAMS_FILE_PATH_ON_HOST)
                            .toString().length > 10 // making sure it's not an buggy file
                        ? DH_PARAMS_FILE_PATH_ON_NGINX
                        : '',
                },
            });
        })
            .then(function (baseNginxConfFileContent) {
            return fs.outputFile(CaptainConstants_1.default.baseNginxConfigPath, baseNginxConfFileContent);
        });
    }
    ensureDhParamFileExists(dataStore) {
        const self = this;
        return fs
            .pathExists(DH_PARAMS_FILE_PATH_ON_HOST) //
            .then(function (dhParamExists) {
            if (!dhParamExists) {
                return false;
            }
            const dhFileContent = fs
                .readFileSync(DH_PARAMS_FILE_PATH_ON_HOST)
                .toString();
            const contentValid = dhFileContent.indexOf('END DH PARAMETERS') > 0;
            if (contentValid) {
                return true;
            }
            Logger_1.default.d(`Invalid dh param content - size of: ${dhFileContent.length}`);
            fs.removeSync(DH_PARAMS_FILE_PATH_ON_HOST);
            return false;
        })
            .then(function (dhParamExists) {
            if (dhParamExists) {
                return;
            }
            Logger_1.default.d('Creating dhparams for the first time - high CPU load is expected.');
            return exec(`openssl dhparam -out ${DH_PARAMS_FILE_PATH_ON_HOST} 2048`).then(function () {
                Logger_1.default.d('Updating Load Balancer - ensureDhParamFileExists');
                return self.rePopulateNginxConfigFile(dataStore);
            });
        })
            .catch((err) => Logger_1.default.e(err));
    }
    init(myNodeId, dataStore) {
        const dockerApi = this.dockerApi;
        const self = this;
        function createNginxServiceOnNode(nodeId) {
            Logger_1.default.d('No Captain Nginx service is running. Creating one on captain node...');
            return dockerApi
                .createServiceOnNodeId(CaptainConstants_1.default.configs.nginxImageName, CaptainConstants_1.default.nginxServiceName, [
                {
                    protocol: 'tcp',
                    publishMode: 'host',
                    containerPort: 80,
                    hostPort: CaptainConstants_1.default.nginxPortNumber,
                },
                {
                    protocol: 'tcp',
                    publishMode: 'host',
                    containerPort: 443,
                    hostPort: 443,
                },
            ], nodeId, undefined, undefined, {
                Reservation: {
                    MemoryBytes: 30 * 1024 * 1024,
                },
            })
                .then(function () {
                const waitTimeInMillis = 5000;
                Logger_1.default.d(`Waiting for ${waitTimeInMillis / 1000} seconds for nginx to start up`);
                return new Promise(function (resolve, reject) {
                    setTimeout(function () {
                        resolve(true);
                    }, waitTimeInMillis);
                });
            });
        }
        return fs
            .outputFile(CaptainConstants_1.default.captainStaticFilesDir +
            CaptainConstants_1.default.nginxDefaultHtmlDir +
            CaptainConstants_1.default.captainConfirmationPath, self.getCaptainPublicRandomKey())
            .then(function () {
            return ejs.render(defaultPageTemplate, {
                message_title: 'Nothing here yet :/',
                message_body: '',
                message_link: 'https://caprover.com/',
                message_link_title: 'Read Docs',
            });
        })
            .then(function (staticPageContent) {
            return fs.outputFile(CaptainConstants_1.default.captainStaticFilesDir +
                CaptainConstants_1.default.nginxDefaultHtmlDir +
                '/index.html', staticPageContent);
        })
            .then(function () {
            return ejs.render(defaultPageTemplate, {
                message_title: 'An Error Occurred :/',
                message_body: '',
                message_link: 'https://caprover.com/',
                message_link_title: 'Read Docs',
            });
        })
            .then(function (errorGenericPageContent) {
            return fs.outputFile(CaptainConstants_1.default.captainStaticFilesDir +
                CaptainConstants_1.default.nginxDefaultHtmlDir +
                '/error_generic_catch_all.html', errorGenericPageContent);
        })
            .then(function () {
            return ejs.render(defaultPageTemplate, {
                message_title: 'NGINX 502 Error :/',
                message_body: "If you are the developer, check your application's logs. See the link below for details",
                message_link: 'https://caprover.com/docs/troubleshooting.html#successful-deploy-but-502-bad-gateway-error',
                message_link_title: 'Docs - 502 Troubleshooting',
            });
        })
            .then(function (error502PageContent) {
            return fs.outputFile(CaptainConstants_1.default.captainStaticFilesDir +
                CaptainConstants_1.default.nginxDefaultHtmlDir +
                '/captain_502_custom_error_page.html', error502PageContent);
        })
            .then(function () {
            Logger_1.default.d('Copying fake certificates...');
            return fs.copy(CAPROVER_CONTAINER_PATH_OF_FAKE_CERTS, HOST_PATH_OF_FAKE_CERTS);
        })
            .then(function () {
            Logger_1.default.d('Updating Load Balancer - Setting up NGINX conf file...');
            return self.rePopulateNginxConfigFile(dataStore, true);
        })
            .then(function () {
            return fs.ensureDir(CaptainConstants_1.default.letsEncryptEtcPath);
        })
            .then(function () {
            return fs.ensureDir(CaptainConstants_1.default.nginxSharedPathOnHost);
        })
            .then(function () {
            return dockerApi.isServiceRunningByName(CaptainConstants_1.default.nginxServiceName);
        })
            .then(function (isRunning) {
            if (isRunning) {
                Logger_1.default.d('Captain Nginx is already running.. ');
                return dockerApi.getNodeIdByServiceName(CaptainConstants_1.default.nginxServiceName, 0);
            }
            else {
                return createNginxServiceOnNode(myNodeId).then(function () {
                    return myNodeId;
                });
            }
        })
            .then(function (nodeId) {
            if (nodeId !== myNodeId) {
                Logger_1.default.d('Captain Nginx is running on a different node. Removing...');
                return dockerApi
                    .removeServiceByName(CaptainConstants_1.default.nginxServiceName)
                    .then(function () {
                    return createNginxServiceOnNode(myNodeId).then(function () {
                        return true;
                    });
                });
            }
            else {
                return true;
            }
        })
            .then(function () {
            Logger_1.default.d('Updating NGINX service...');
            return dockerApi.updateService(CaptainConstants_1.default.nginxServiceName, CaptainConstants_1.default.configs.nginxImageName, [
                {
                    containerPath: CaptainConstants_1.default.nginxStaticRootDir,
                    hostPath: CaptainConstants_1.default.captainStaticFilesDir,
                },
                {
                    containerPath: NGINX_CONTAINER_PATH_OF_FAKE_CERTS,
                    hostPath: HOST_PATH_OF_FAKE_CERTS,
                },
                {
                    containerPath: '/etc/nginx/nginx.conf',
                    hostPath: CaptainConstants_1.default.baseNginxConfigPath,
                },
                {
                    containerPath: CONTAINER_PATH_OF_CONFIG,
                    hostPath: CaptainConstants_1.default.perAppNginxConfigPathBase,
                },
                {
                    containerPath: CaptainConstants_1.default.letsEncryptEtcPathOnNginx,
                    hostPath: CaptainConstants_1.default.letsEncryptEtcPath,
                },
                {
                    containerPath: CaptainConstants_1.default.nginxSharedPathOnNginx,
                    hostPath: CaptainConstants_1.default.nginxSharedPathOnHost,
                },
            ], [CaptainConstants_1.default.captainNetworkName], undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
        })
            .then(function () {
            const waitTimeInMillis = 5000;
            Logger_1.default.d(`Waiting for ${waitTimeInMillis / 1000} seconds for nginx reload to take into effect`);
            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    Logger_1.default.d('NGINX is fully set up and working...');
                    resolve(true);
                }, waitTimeInMillis);
            });
        })
            .then(function () {
            return self.certbotManager.init(myNodeId);
        })
            .then(function () {
            // schedule the 10sec:
            // Ensure DH Params exists
            // First attempt to renew certs in
            setTimeout(function () {
                self.ensureDhParamFileExists(dataStore) //
                    .then(function () {
                    return self.renewAllCertsAndReload(dataStore);
                })
                    .catch((err) => {
                    Logger_1.default.e(err);
                });
            }, 1000 * 10);
        });
    }
    renewAllCertsAndReload(dataStore) {
        const self = this;
        // before doing renewal, let's schedule the next one in 20.3 hours!
        // this random schedule helps to avoid retrying at the same time of
        // the day in case if that's our super high traffic time
        setTimeout(function () {
            self.renewAllCertsAndReload(dataStore) //
                .catch((err) => {
                Logger_1.default.e(err);
            });
        }, 1000 * 3600 * 20.3);
        return self.certbotManager
            .renewAllCerts() //
            .then(function () {
            Logger_1.default.d('Updating Load Balancer - renewAllCerts');
            return self.rePopulateNginxConfigFile(dataStore);
        });
    }
}
exports.default = LoadBalancerManager;
//# sourceMappingURL=LoadBalancerManager.js.map