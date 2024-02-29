"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
class OtpAuthenticator {
    constructor(dataStore, proManager) {
        this.dataStore = dataStore;
        this.proManager = proManager;
    }
    set2fa(doEnable, tokenSuppliedByClient) {
        tokenSuppliedByClient = (tokenSuppliedByClient || '').trim();
        const self = this;
        return Promise.resolve() //
            .then(function () {
            return self.dataStore.getProDataStore().isOtpEnabled();
        })
            .then(function (isEnabledNow) {
            if (isEnabledNow === doEnable) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_ALREADY_EXIST, doEnable
                    ? 'Two factor was already enabled'
                    : 'Two factor was already disabled');
            }
            if (!doEnable) {
                // disabling is easy, no checks, just disable in DB
                return self.dataStore
                    .getProDataStore()
                    .setOtpEnabled(false)
                    .then(function () {
                    return { isEnabled: false };
                });
            }
            // enabling
            if (!tokenSuppliedByClient) {
                return self.proManager
                    .regenerateSecret() //
                    .then(function (otpPath) {
                    return { isEnabled: false, otpPath };
                });
            }
            else {
                // if token is present, compare against the secret
                return self.proManager
                    .verifyToken(tokenSuppliedByClient) //
                    .then(function (isTokenValid) {
                    if (!isTokenValid) {
                        throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_OPERATION, 'Entered token is invalid!');
                    }
                    return self.dataStore
                        .getProDataStore()
                        .setOtpEnabled(true)
                        .then(function () {
                        return { isEnabled: true };
                    });
                });
            }
        });
    }
    is2FactorEnabled() {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            return self.dataStore.getProDataStore().isOtpEnabled();
        })
            .then(function (isEnabled) {
            return !!isEnabled;
        });
    }
    isOtpTokenValid(providedToken) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            return self.dataStore.getProDataStore().isOtpEnabled();
        })
            .then(function (isEnabled) {
            if (!isEnabled) {
                return true;
            }
            return self.proManager.verifyToken(providedToken);
        });
    }
}
exports.default = OtpAuthenticator;
//# sourceMappingURL=OtpAuthenticator.js.map