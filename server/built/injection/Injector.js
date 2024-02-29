"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectUserUsingCookieDataOnly = exports.injectUserForWebhook = exports.injectUserForBuildTrigger = exports.injectUser = exports.injectGlobal = void 0;
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const BaseApi_1 = require("../api/BaseApi");
const DataStoreProvider_1 = require("../datastore/DataStoreProvider");
const DockerApi_1 = require("../docker/DockerApi");
const Authenticator_1 = require("../user/Authenticator");
const OtpAuthenticator_1 = require("../user/pro/OtpAuthenticator");
const ServiceManager_1 = require("../user/ServiceManager");
const CaptainManager_1 = require("../user/system/CaptainManager");
const UserManagerProvider_1 = require("../user/UserManagerProvider");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const Logger_1 = require("../utils/Logger");
const InjectionExtractor_1 = require("./InjectionExtractor");
const dockerApi = DockerApi_1.default.get();
/**
 * Global dependency injection module
 */
function injectGlobal() {
    return function (req, res, next) {
        const locals = res.locals;
        locals.namespace =
            req.header(CaptainConstants_1.default.headerNamespace) ||
                CaptainConstants_1.default.rootNameSpace;
        if (locals.namespace !== CaptainConstants_1.default.rootNameSpace) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Namespace unknown');
        }
        locals.initialized = CaptainManager_1.default.get().isInitialized();
        locals.forceSsl = CaptainManager_1.default.get().getForceSslValue();
        locals.userManagerForLoginOnly = UserManagerProvider_1.UserManagerProvider.get(locals.namespace);
        next();
    };
}
exports.injectGlobal = injectGlobal;
/**
 * User dependency injection module
 */
function injectUser() {
    return function (req, res, next) {
        if (InjectionExtractor_1.default.extractUserFromInjected(res).user) {
            next();
            return; // user is already injected by another layer
        }
        const namespace = res.locals.namespace;
        Authenticator_1.default.getAuthenticator(namespace)
            .decodeAuthToken(req.header(CaptainConstants_1.default.headerAuth) || '')
            .then(function (userDecoded) {
            if (userDecoded) {
                const datastore = DataStoreProvider_1.default.getDataStore(namespace);
                const userManager = UserManagerProvider_1.UserManagerProvider.get(namespace);
                const serviceManager = ServiceManager_1.default.get(namespace, Authenticator_1.default.getAuthenticator(namespace), datastore, dockerApi, CaptainManager_1.default.get().getLoadBalanceManager(), userManager.eventLogger, CaptainManager_1.default.get().getDomainResolveChecker());
                const user = {
                    namespace: namespace,
                    dataStore: datastore,
                    serviceManager: serviceManager,
                    otpAuthenticator: new OtpAuthenticator_1.default(datastore, userManager.proManager),
                    initialized: serviceManager.isInited(),
                    userManager: userManager,
                };
                res.locals.user = user;
            }
            next();
        })
            .catch(function (error) {
            if (error && error.captainErrorType) {
                res.send(new BaseApi_1.default(error.captainErrorType, error.apiMessage));
                return;
            }
            Logger_1.default.e(error);
            res.locals.user = undefined;
            next();
        });
    };
}
exports.injectUser = injectUser;
/**
 * A pseudo user injection. Only used for build triggers. Can only trigger certain actions.
 */
function injectUserForBuildTrigger() {
    return function (req, res, next) {
        const locals = res.locals;
        const token = req.header(CaptainConstants_1.default.headerAppToken);
        const namespace = locals.namespace;
        const appName = req.params.appName;
        if (req.header(CaptainConstants_1.default.headerAuth)) {
            // Auth header is present, skip user injection for app token
            next();
            return;
        }
        if (!token || !namespace || !appName) {
            Logger_1.default.e('Trigger app build is called with no token/namespace/appName');
            next();
            return;
        }
        const dataStore = DataStoreProvider_1.default.getDataStore(namespace);
        let app = undefined;
        Promise.resolve()
            .then(function () {
            return dataStore.getAppsDataStore().getAppDefinition(appName);
        })
            .then(function (appFound) {
            var _a;
            app = appFound;
            const tokenMatches = ((_a = app === null || app === void 0 ? void 0 : app.appDeployTokenConfig) === null || _a === void 0 ? void 0 : _a.enabled) &&
                app.appDeployTokenConfig.appDeployToken === token;
            if (!tokenMatches) {
                Logger_1.default.e('Token mismatch for app build');
                next();
                return;
            }
            const datastore = DataStoreProvider_1.default.getDataStore(namespace);
            const userManager = UserManagerProvider_1.UserManagerProvider.get(namespace);
            const serviceManager = ServiceManager_1.default.get(namespace, Authenticator_1.default.getAuthenticator(namespace), datastore, dockerApi, CaptainManager_1.default.get().getLoadBalanceManager(), userManager.eventLogger, CaptainManager_1.default.get().getDomainResolveChecker());
            const user = {
                namespace: namespace,
                dataStore: datastore,
                serviceManager: serviceManager,
                otpAuthenticator: new OtpAuthenticator_1.default(datastore, userManager.proManager),
                initialized: serviceManager.isInited(),
                userManager: userManager,
            };
            res.locals.user = user;
            res.locals.app = app;
            res.locals.appName = appName;
            next();
        })
            .catch(function (error) {
            Logger_1.default.e(error);
            res.locals.app = undefined;
            next();
        });
    };
}
exports.injectUserForBuildTrigger = injectUserForBuildTrigger;
/**
 * A pseudo user injection. Only used for webhooks. Can only trigger certain actions.
 */
function injectUserForWebhook() {
    return function (req, res, next) {
        const token = req.query.token;
        const namespace = req.query.namespace;
        let app = undefined;
        if (!token || !namespace) {
            Logger_1.default.e('Trigger build is called with no token/namespace');
            next();
            return;
        }
        const dataStore = DataStoreProvider_1.default.getDataStore(namespace);
        let decodedInfo;
        Authenticator_1.default.getAuthenticator(namespace)
            .decodeAppPushWebhookToken(token)
            .then(function (data) {
            decodedInfo = data;
            return dataStore
                .getAppsDataStore()
                .getAppDefinition(decodedInfo.appName);
        })
            .then(function (appFound) {
            app = appFound;
            if (app.appPushWebhook &&
                app.appPushWebhook.tokenVersion !== decodedInfo.tokenVersion) {
                throw new Error('Token Info do not match');
            }
            const datastore = DataStoreProvider_1.default.getDataStore(namespace);
            const userManager = UserManagerProvider_1.UserManagerProvider.get(namespace);
            const serviceManager = ServiceManager_1.default.get(namespace, Authenticator_1.default.getAuthenticator(namespace), datastore, dockerApi, CaptainManager_1.default.get().getLoadBalanceManager(), userManager.eventLogger, CaptainManager_1.default.get().getDomainResolveChecker());
            const user = {
                namespace: namespace,
                dataStore: datastore,
                otpAuthenticator: new OtpAuthenticator_1.default(datastore, userManager.proManager),
                serviceManager: serviceManager,
                initialized: serviceManager.isInited(),
                userManager: userManager,
            };
            res.locals.user = user;
            res.locals.app = app;
            res.locals.appName = decodedInfo.appName;
            next();
        })
            .catch(function (error) {
            Logger_1.default.e(error);
            res.locals.app = undefined;
            next();
        });
    };
}
exports.injectUserForWebhook = injectUserForWebhook;
/**
 * User dependency injection module. This is a less secure way for user injection. But for reverse proxy services,
 * this is the only way that we can secure the call
 */
function injectUserUsingCookieDataOnly() {
    return function (req, res, next) {
        Authenticator_1.default.getAuthenticator(CaptainConstants_1.default.rootNameSpace)
            .decodeAuthTokenFromCookies(req.cookies[CaptainConstants_1.default.headerCookieAuth])
            .then(function (user) {
            res.locals.user = user;
            next();
        })
            .catch(function (error) {
            if (error && error.captainErrorType) {
                res.send(new BaseApi_1.default(error.captainErrorType, error.apiMessage));
                return;
            }
            Logger_1.default.e(error);
            res.locals.user = undefined;
            next();
        });
    };
}
exports.injectUserUsingCookieDataOnly = injectUserUsingCookieDataOnly;
//# sourceMappingURL=Injector.js.map