"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserManager = void 0;
const DataStoreProvider_1 = require("../datastore/DataStoreProvider");
const DockerApi_1 = require("../docker/DockerApi");
const Authenticator_1 = require("./Authenticator");
const EventLogger_1 = require("./events/EventLogger");
const FeatureFlags_1 = require("./FeatureFlags");
const OtpAuthenticator_1 = require("./pro/OtpAuthenticator");
const ProManager_1 = require("./pro/ProManager");
const ServiceManager_1 = require("./ServiceManager");
const CaptainManager_1 = require("./system/CaptainManager");
class UserManager {
    constructor(namespace) {
        this.datastore = DataStoreProvider_1.default.getDataStore(namespace);
        this.proManager = new ProManager_1.default(this.datastore.getProDataStore(), FeatureFlags_1.default.get(this.datastore));
        this.eventLogger = EventLogger_1.EventLoggerFactory.get(this.proManager).getLogger();
        this.serviceManager = ServiceManager_1.default.get(namespace, Authenticator_1.default.getAuthenticator(namespace), this.datastore, DockerApi_1.default.get(), CaptainManager_1.default.get().getLoadBalanceManager(), this.eventLogger, CaptainManager_1.default.get().getDomainResolveChecker());
        this.otpAuthenticator = new OtpAuthenticator_1.default(this.datastore, this.proManager);
    }
}
exports.UserManager = UserManager;
//# sourceMappingURL=UserManager.js.map