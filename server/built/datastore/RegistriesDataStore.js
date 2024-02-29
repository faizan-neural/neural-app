"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const IRegistryInfo_1 = require("../models/IRegistryInfo");
const DOCKER_REGISTRIES = 'dockerRegistries';
const DEFAULT_DOCKER_REGISTRY_ID = 'defaultDockerRegId';
class RegistriesDataStore {
    constructor(data, namepace) {
        this.data = data;
        this.namepace = namepace;
    }
    setEncryptor(encryptor) {
        this.encryptor = encryptor;
    }
    getDefaultPushRegistryId() {
        const self = this;
        return Promise.resolve().then(function () {
            return self.data.get(DEFAULT_DOCKER_REGISTRY_ID);
        });
    }
    setDefaultPushRegistryId(registryId) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.getAllRegistries();
        })
            .then(function (registries) {
            let found = false;
            for (let i = 0; i < registries.length; i++) {
                const registry = registries[i];
                if (registry.id === registryId) {
                    found = true;
                }
            }
            // registryId can be NULL/Empty, meaning that no registry will be the default push registry
            if (!found && !!registryId) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.NOT_FOUND, 'Registry not found');
            }
            self.data.set(DEFAULT_DOCKER_REGISTRY_ID, registryId);
        });
    }
    getRegistryById(registryId) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            if (!registryId)
                throw new Error('Empty registry id!');
            return self.getAllRegistries();
        })
            .then(function (registries) {
            for (let i = 0; i < registries.length; i++) {
                const registry = registries[i];
                if (registry.id === registryId) {
                    return registry;
                }
            }
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.NOT_FOUND, 'Registry not found');
        });
    }
    deleteRegistry(registryId) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            if (!registryId)
                throw new Error('Empty registry id to delete!');
            return self.getAllRegistries();
        })
            .then(function (registries) {
            const newReg = [];
            for (let i = 0; i < registries.length; i++) {
                const registry = registries[i];
                if (registry.id !== registryId) {
                    newReg.push(registry);
                }
            }
            if (newReg.length === registries.length) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.NOT_FOUND, 'Registry not found');
            }
            self.saveAllRegistries(newReg);
        });
    }
    getAllRegistries() {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.data.get(DOCKER_REGISTRIES) || [];
        })
            .then(function (registries) {
            const unencryptedList = [];
            for (let i = 0; i < registries.length; i++) {
                const element = registries[i];
                unencryptedList.push({
                    id: element.id,
                    registryDomain: element.registryDomain,
                    registryImagePrefix: element.registryImagePrefix,
                    registryUser: element.registryUser,
                    registryPassword: self.encryptor.decrypt(element.registryPasswordEncrypted),
                    registryType: element.registryType,
                });
            }
            return unencryptedList;
        });
    }
    updateRegistry(id, registryUser, registryPassword, registryDomain, registryImagePrefix) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            if (!id ||
                !registryUser ||
                !registryPassword ||
                !registryDomain) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, 'User, password and domain are required.');
            }
            return self.getAllRegistries();
        })
            .then(function (registries) {
            let found = false;
            for (let idx = 0; idx < registries.length; idx++) {
                const element = registries[idx];
                if (element.id === id) {
                    if (element.registryType === IRegistryInfo_1.IRegistryTypes.LOCAL_REG) {
                        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_OPERATION, 'You cannot edit self-hosted registry');
                    }
                    element.registryUser = registryUser;
                    element.registryPassword = registryPassword;
                    element.registryDomain = registryDomain;
                    element.registryImagePrefix = registryImagePrefix;
                    found = true;
                }
            }
            if (!found)
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.NOT_FOUND, 'Registry ID not found');
            return self.saveAllRegistries(registries);
        });
    }
    addRegistryToDb(registryUser, registryPassword, registryDomain, registryImagePrefix, registryType) {
        const self = this;
        let savedId = undefined;
        return Promise.resolve()
            .then(function () {
            if (!registryUser ||
                !registryPassword ||
                !registryDomain ||
                !registryType) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, 'User, password and domain are required.');
            }
            return self.getAllRegistries();
        })
            .then(function (registries) {
            let id = (0, uuid_1.v4)();
            let isAlreadyTaken = true;
            while (isAlreadyTaken) {
                id = (0, uuid_1.v4)();
                isAlreadyTaken = false;
                for (let i = 0; i < registries.length; i++) {
                    if (registries[i].id === id) {
                        isAlreadyTaken = true;
                        break;
                    }
                }
            }
            savedId = id;
            registries.push({
                id,
                registryUser,
                registryPassword,
                registryDomain,
                registryImagePrefix,
                registryType,
            });
            return self.saveAllRegistries(registries);
        })
            .then(function () {
            if (!savedId)
                throw new Error('Saved registry, but ID is null. This should never happen');
            return savedId;
        });
    }
    saveAllRegistries(registries) {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            const encryptedList = [];
            for (let i = 0; i < registries.length; i++) {
                const element = registries[i];
                encryptedList.push({
                    id: element.id,
                    registryDomain: element.registryDomain,
                    registryImagePrefix: element.registryImagePrefix,
                    registryUser: element.registryUser,
                    registryPasswordEncrypted: self.encryptor.encrypt(element.registryPassword),
                    registryType: element.registryType,
                });
            }
            self.data.set(DOCKER_REGISTRIES, encryptedList);
        });
    }
}
exports.default = RegistriesDataStore;
//# sourceMappingURL=RegistriesDataStore.js.map