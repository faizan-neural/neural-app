"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jwt = require("jsonwebtoken");
const uuid_1 = require("uuid");
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const EnvVars_1 = require("../utils/EnvVars");
const Logger_1 = require("../utils/Logger");
const bcrypt = require("bcryptjs");
const captainDefaultPassword = EnvVars_1.default.DEFAULT_PASSWORD || 'captain42';
const COOKIE_AUTH_SUFFIX = 'cookie-';
const WEBHOOK_APP_PUSH_SUFFIX = '-webhook-app-push';
const DOWNLOAD_TOKEN = '-download-token';
class Authenticator {
    constructor(secret, namespace) {
        this.encryptionKey = secret + namespace; // making encryption key unique per namespace!
        this.namespace = namespace;
        this.tokenVersion = CaptainConstants_1.default.isDebug ? 'test' : (0, uuid_1.v4)();
    }
    changepass(oldPass, newPass, savedHashedPassword) {
        const self = this;
        oldPass = oldPass || '';
        newPass = newPass || '';
        return Promise.resolve()
            .then(function () {
            if (!oldPass || !newPass || newPass.length < 8) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Password is too small.');
            }
            return self.isPasswordCorrect(oldPass, savedHashedPassword);
        })
            .then(function (isPasswordCorrect) {
            if (!isPasswordCorrect) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_WRONG_PASSWORD, 'Old password is incorrect.');
            }
            self.tokenVersion = (0, uuid_1.v4)();
            const hashed = bcrypt.hashSync(self.encryptionKey + newPass, bcrypt.genSaltSync(10));
            return hashed;
        });
    }
    isPasswordCorrect(password, savedHashedPassword) {
        const self = this;
        return Promise.resolve().then(function () {
            password = password || '';
            if (!savedHashedPassword) {
                return captainDefaultPassword === password;
            }
            return bcrypt.compareSync(self.encryptionKey + password, savedHashedPassword);
        });
    }
    getAuthTokenForCookies(otpConfig, password, savedHashedPassword) {
        return this.getAuthToken(otpConfig, password, savedHashedPassword, COOKIE_AUTH_SUFFIX);
    }
    getAuthToken(otpConfig, password, savedHashedPassword, keySuffix) {
        const self = this;
        // intentionally same error to avoid giving bad actors any hints
        const INVALID_CREDS_ERROR = 'Invalid credentials';
        return Promise.resolve()
            .then(function () {
            return otpConfig.otpAuthenticator.isOtpTokenValid(otpConfig.otpToken);
        })
            .then(function (otpValid) {
            if (!otpValid) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_WRONG_PASSWORD, INVALID_CREDS_ERROR);
            }
            return self.isPasswordCorrect(password, savedHashedPassword);
        })
            .then(function (isPasswordCorrect) {
            if (!isPasswordCorrect) {
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_WRONG_PASSWORD, INVALID_CREDS_ERROR);
            }
            const userObj = {
                namespace: self.namespace,
                tokenVersion: self.tokenVersion,
            };
            return jwt.sign({
                data: userObj,
            }, self.encryptionKey + (keySuffix ? keySuffix : ''), { expiresIn: '480h' });
        });
    }
    decodeAuthTokenFromCookies(token) {
        return this.decodeAuthToken(token, COOKIE_AUTH_SUFFIX);
    }
    decodeAuthToken(token, keySuffix) {
        const self = this;
        return new Promise(function (resolve, reject) {
            jwt.verify(token, self.encryptionKey + (keySuffix ? keySuffix : ''), function (err, rawDecoded) {
                if (err) {
                    Logger_1.default.e(err);
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_AUTH_TOKEN_INVALID, 'Auth token corrupted'));
                    return;
                }
                const decodedData = rawDecoded.data;
                if (decodedData.tokenVersion !== self.tokenVersion) {
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_AUTH_TOKEN_INVALID, 'Auth token is no longer valid. Request for a new auth token'));
                    return;
                }
                if (decodedData.namespace !== self.namespace) {
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_AUTH_TOKEN_INVALID, 'Auth token does not match the namespace'));
                    return;
                }
                resolve(decodedData);
            });
        });
    }
    getAppPushWebhookToken(appName, tokenVersion) {
        const self = this;
        if (!appName) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'App name are required for webhook token..');
        }
        return self.getGenericToken({
            tokenVersion: tokenVersion,
            appName: appName,
        }, WEBHOOK_APP_PUSH_SUFFIX);
    }
    decodeAppPushWebhookToken(token) {
        const self = this;
        return self.decodeGenericToken(token, WEBHOOK_APP_PUSH_SUFFIX);
    }
    getDownloadToken(downloadFileName) {
        const self = this;
        if (!downloadFileName) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'filename is required for download token..');
        }
        return self.getGenericToken({
            downloadFileName: downloadFileName,
        }, DOWNLOAD_TOKEN, '2m');
    }
    decodeDownloadToken(token) {
        const self = this;
        return self.decodeGenericToken(token, DOWNLOAD_TOKEN);
    }
    getGenericToken(obj, keySuffix, expiresIn) {
        const self = this;
        obj.namespace = self.namespace;
        return Promise.resolve().then(function () {
            return jwt.sign({
                data: obj,
            }, self.encryptionKey + (keySuffix ? keySuffix : ''), expiresIn
                ? {
                    expiresIn: expiresIn,
                }
                : undefined);
        });
    }
    decodeGenericToken(token, keySuffix) {
        const self = this;
        return new Promise(function (resolve, reject) {
            jwt.verify(token, self.encryptionKey + (keySuffix ? keySuffix : ''), function (err, rawDecoded) {
                if (err) {
                    Logger_1.default.e(err);
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_AUTH_TOKEN_INVALID, 'Token corrupted'));
                    return;
                }
                const decodedData = rawDecoded.data;
                if (decodedData.namespace !== self.namespace) {
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_AUTH_TOKEN_INVALID, 'token does not match the namespace'));
                    return;
                }
                resolve(decodedData);
            });
        });
    }
    static setMainSalt(salt) {
        if (Authenticator.mainSalt)
            throw new Error('Salt is already set!!');
        Authenticator.mainSalt = salt;
    }
    static getAuthenticator(namespace) {
        const authenticatorCache = Authenticator.authenticatorCache;
        if (!namespace) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_NOT_AUTHORIZED, 'Empty namespace');
        }
        if (!authenticatorCache[namespace]) {
            const captainSalt = Authenticator.mainSalt;
            if (captainSalt) {
                authenticatorCache[namespace] = new Authenticator(captainSalt, namespace);
            }
            else {
                throw new Error('Salt is not set! Cannot create authenticator');
            }
        }
        return authenticatorCache[namespace];
    }
}
Authenticator.authenticatorCache = {};
exports.default = Authenticator;
//# sourceMappingURL=Authenticator.js.map