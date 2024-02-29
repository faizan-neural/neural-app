"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const IRegistryInfo_1 = require("../models/IRegistryInfo");
const Logger_1 = require("../utils/Logger");
const Utils_1 = require("../utils/Utils");
class DockerRegistryHelper {
    constructor(dataStore, dockerApi) {
        this.dockerApi = dockerApi;
        this.registriesDataStore = dataStore.getRegistriesDataStore();
    }
    retagAndPushIfDefaultPushExist(imageName, version, buildLogs) {
        const self = this;
        let allRegistries;
        let fullImageName = `${imageName}:${version}`;
        return Promise.resolve() //
            .then(function () {
            if (!imageName)
                throw new Error('no image name! cannot re-tag!');
            if (imageName.indexOf('/') >= 0 || imageName.indexOf(':') >= 0)
                throw new Error('ImageName should not contain "/" or ":" before re-tagging!');
            return self.getAllRegistries();
        })
            .then(function (data) {
            allRegistries = data;
            return self.getDefaultPushRegistryId();
        })
            .then(function (defaultRegId) {
            const ret = undefined;
            for (let idx = 0; idx < allRegistries.length; idx++) {
                const element = allRegistries[idx];
                if (defaultRegId && element.id === defaultRegId) {
                    return element;
                }
            }
            return ret;
        })
            .then(function (data) {
            if (!data)
                return fullImageName;
            const imageNameWithoutDockerAuth = fullImageName;
            fullImageName = `${data.registryDomain}/${data.registryImagePrefix}/${fullImageName}`;
            return self
                .getDockerAuthObjectForImageName(fullImageName)
                .then(function (authObj) {
                if (!authObj) {
                    throw new Error('Docker Auth Object is NULL just after re-tagging! Something is wrong!');
                }
                Logger_1.default.d('Docker Auth is found. Pushing the image...');
                return Promise.resolve()
                    .then(function () {
                    return self.dockerApi.retag(imageNameWithoutDockerAuth, fullImageName);
                })
                    .then(function () {
                    return self.dockerApi.pushImage(fullImageName, authObj, buildLogs);
                })
                    .catch(function (error) {
                    return new Promise(function (resolve, reject) {
                        Logger_1.default.e('PUSH FAILED');
                        Logger_1.default.e(error);
                        reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Push failed: ${error}`));
                    });
                });
            })
                .then(function () {
                return fullImageName;
            });
        });
    }
    getDockerAuthObjectForImageName(imageName) {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            //
            return self.getAllRegistries();
        })
            .then(function (regs) {
            for (let index = 0; index < regs.length; index++) {
                const element = regs[index];
                const prefix = element.registryImagePrefix;
                const registryIdentifierPrefix = element.registryDomain +
                    (prefix ? `/${prefix}` : '') +
                    '/';
                if (imageName.startsWith(registryIdentifierPrefix)) {
                    return {
                        serveraddress: element.registryDomain,
                        username: element.registryUser,
                        password: element.registryPassword,
                        // email: CaptainConstants.defaultEmail, // email is optional
                    };
                }
            }
            function isDomainDocker(domainToTest) {
                return (domainToTest.endsWith('.docker.io') || // *.docker.io/user/image is from Docker Hub
                    domainToTest.endsWith('.docker.com') || // *.docker.com/user/image is from Docker Hub
                    domainToTest === 'docker.com' || // docker.com/user/image is from Docker Hub
                    domainToTest === 'docker.io' // docker.io/user/image is from Docker Hub
                );
            }
            // if none of the registries explicitly relates to the image name, and no other explicit domain is defined,
            // try Docker Hub registry as the default
            if (imageName.split('/').length == 1 || // image is from Docker Hub
                imageName.split('/').length == 2 || // user/image is from Docker Hub
                isDomainDocker(imageName.split('/')[0]))
                for (let index = 0; index < regs.length; index++) {
                    const element = regs[index];
                    if (isDomainDocker(element.registryDomain)) {
                        return {
                            serveraddress: element.registryDomain,
                            username: element.registryUser,
                            password: element.registryPassword,
                            // email: CaptainConstants.defaultEmail, // email is optional
                        };
                    }
                }
            return undefined;
        });
    }
    createDockerRegistryConfig() {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            //
            return self.getAllRegistries();
        })
            .then(function (regs) {
            const registryConfig = {};
            for (let index = 0; index < regs.length; index++) {
                const element = regs[index];
                // https://docs.docker.com/engine/api/v1.40/#operation/ImageBuild
                // For: X-Registry-Config
                // Only the registry domain name (and port if not the default 443) are required. However,
                // for legacy reasons, the Docker Hub registry must be specified with both a https:// prefix
                // and a /v1/ suffix even though Docker will prefer to use the v2 registry API.
                if (element.registryDomain.indexOf('.docker.io') >= 0) {
                    registryConfig['https://index.docker.io/v1/'] = {
                        username: element.registryUser,
                        password: element.registryPassword,
                    };
                }
                else {
                    registryConfig[element.registryDomain] = {
                        username: element.registryUser,
                        password: element.registryPassword,
                    };
                }
            }
            return registryConfig;
        });
    }
    setDefaultPushRegistry(registryId) {
        const self = this;
        return Promise.resolve().then(function () {
            return self.registriesDataStore.setDefaultPushRegistryId(registryId);
        });
    }
    getDefaultPushRegistryId() {
        const self = this;
        return Promise.resolve().then(function () {
            return self.registriesDataStore.getDefaultPushRegistryId();
        });
    }
    deleteRegistry(registryId, allowLocalDelete) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.getDefaultPushRegistryId();
        })
            .then(function (registryIdDefaultPush) {
            if (registryId === registryIdDefaultPush) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, 'Cannot remove the default push. First change the default push.');
            }
            return self.registriesDataStore.getRegistryById(registryId);
        })
            .then(function (registry) {
            if (registry.registryType === IRegistryInfo_1.IRegistryTypes.LOCAL_REG &&
                !allowLocalDelete) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_OPERATION, 'You cannot delete self-hosted registry.');
            }
            return self.registriesDataStore.deleteRegistry(registryId);
        });
    }
    getAllRegistries() {
        const self = this;
        return Promise.resolve().then(function () {
            return self.registriesDataStore.getAllRegistries();
        });
    }
    addRegistry(registryUser, registryPassword, registryDomain, registryImagePrefix, registryType) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            registryDomain = Utils_1.default.removeHttpHttps(registryDomain);
            if (registryType === IRegistryInfo_1.IRegistryTypes.LOCAL_REG) {
                // We don't check the auth details for local registry. We create it, we know it's correct!
                return;
            }
            return self.ensureAuthenticationForRegistry(registryUser, registryPassword, registryDomain);
        })
            .then(function () {
            return self.registriesDataStore.getAllRegistries();
        })
            .then(function (allRegs) {
            let promiseToAddRegistry = self.registriesDataStore.addRegistryToDb(registryUser, registryPassword, registryDomain, registryImagePrefix, registryType);
            // Product decision. We want to make the first added registry the default one,
            // this way, it's easier for new users to grasp the concept of default push registry.
            if (allRegs.length === 0) {
                promiseToAddRegistry = promiseToAddRegistry //
                    .then(function (idOfNewReg) {
                    return self.registriesDataStore
                        .setDefaultPushRegistryId(idOfNewReg)
                        .then(function () {
                        return idOfNewReg;
                    });
                });
            }
            return promiseToAddRegistry;
        });
    }
    updateRegistry(id, registryUser, registryPassword, registryDomain, registryImagePrefix) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            registryDomain = Utils_1.default.removeHttpHttps(registryDomain);
            return self.ensureAuthenticationForRegistry(registryUser, registryPassword, registryDomain);
        })
            .then(function () {
            return self.registriesDataStore.updateRegistry(id, registryUser, registryPassword, registryDomain, registryImagePrefix);
        });
    }
    ensureAuthenticationForRegistry(registryUser, registryPassword, registryDomain) {
        const self = this;
        return self.dockerApi
            .checkRegistryAuth({
            username: registryUser,
            password: registryPassword,
            serveraddress: registryDomain,
        })
            .catch(function (err) {
            Logger_1.default.e(err);
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.AUTHENTICATION_FAILED, 'Registry authentication failed. Either username, password or domain is incorrect.');
        });
    }
}
exports.default = DockerRegistryHelper;
//# sourceMappingURL=DockerRegistryHelper.js.map