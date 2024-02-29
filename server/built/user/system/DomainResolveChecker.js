"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const Logger_1 = require("../../utils/Logger");
const Utils_1 = require("../../utils/Utils");
const request = require("request");
const fs = require("fs-extra");
class DomainResolveChecker {
    constructor(loadBalancerManager, certbotManager) {
        this.loadBalancerManager = loadBalancerManager;
        this.certbotManager = certbotManager;
    }
    requestCertificateForDomain(domainName) {
        return this.certbotManager.enableSsl(domainName);
    }
    /**
     * Returns a promise successfully if verification is succeeded. If it fails, it throws an exception.
     *
     * @param domainName the domain to verify, app.mycaptainroot.com or www.myawesomeapp.com
     * @param identifierSuffix an optional suffix to be added to the identifier file name to avoid name conflict
     *
     * @returns {Promise.<boolean>}
     */
    verifyCaptainOwnsDomainOrThrow(domainName, identifierSuffix) {
        if (CaptainConstants_1.default.configs.skipVerifyingDomains) {
            return Utils_1.default.getDelayedPromise(1000);
        }
        const self = this;
        const randomUuid = (0, uuid_1.v4)();
        const captainConfirmationPath = CaptainConstants_1.default.captainConfirmationPath +
            (identifierSuffix ? identifierSuffix : '');
        return Promise.resolve()
            .then(function () {
            return self.certbotManager.domainValidOrThrow(domainName);
        })
            .then(function () {
            return fs.outputFile(`${CaptainConstants_1.default.captainStaticFilesDir +
                CaptainConstants_1.default.nginxDomainSpecificHtmlDir}/${domainName}${captainConfirmationPath}`, randomUuid);
        })
            .then(function () {
            return new Promise(function (resolve) {
                setTimeout(function () {
                    resolve();
                }, 1000);
            });
        })
            .then(function () {
            return new Promise(function (resolve, reject) {
                const url = `http://${domainName}:${CaptainConstants_1.default.nginxPortNumber}${captainConfirmationPath}`;
                request(url, function (error, response, body) {
                    if (error || !body || body !== randomUuid) {
                        Logger_1.default.e(`Verification Failed for ${domainName}`);
                        Logger_1.default.e(`Error        ${error}`);
                        Logger_1.default.e(`body         ${body}`);
                        Logger_1.default.e(`randomUuid   ${randomUuid}`);
                        reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.VERIFICATION_FAILED, 'Verification Failed.'));
                        return;
                    }
                    resolve();
                });
            });
        });
    }
    verifyDomainResolvesToDefaultServerOnHost(domainName) {
        if (CaptainConstants_1.default.configs.skipVerifyingDomains) {
            return Utils_1.default.getDelayedPromise(1000);
        }
        const self = this;
        return new Promise(function (resolve, reject) {
            const url = `http://${domainName}${CaptainConstants_1.default.captainConfirmationPath}`;
            Logger_1.default.d(`Sending request to ${url}`);
            request(url, function (error, response, body) {
                if (error ||
                    !body ||
                    body !==
                        self.loadBalancerManager.getCaptainPublicRandomKey()) {
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.VERIFICATION_FAILED, 'Verification Failed.'));
                    return;
                }
                resolve();
            });
        });
    }
}
exports.default = DomainResolveChecker;
//# sourceMappingURL=DomainResolveChecker.js.map