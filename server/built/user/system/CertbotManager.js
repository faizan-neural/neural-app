"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const Logger_1 = require("../../utils/Logger");
const Utils_1 = require("../../utils/Utils");
const fs = require("fs-extra");
const WEBROOT_PATH_IN_CERTBOT = '/captain-webroot';
const WEBROOT_PATH_IN_CAPTAIN = CaptainConstants_1.default.captainStaticFilesDir +
    CaptainConstants_1.default.nginxDomainSpecificHtmlDir;
const shouldUseStaging = false; // CaptainConstants.isDebug;
class CertbotManager {
    constructor(dockerApi) {
        this.dockerApi = dockerApi;
        this.dockerApi = dockerApi;
    }
    domainValidOrThrow(domainName) {
        if (!domainName) {
            throw new Error('Domain Name is empty');
        }
        const RegExpression = /^[a-z0-9\.\-]*$/;
        if (!RegExpression.test(domainName)) {
            throw new Error('Bad Domain Name!');
        }
    }
    getCertRelativePathForDomain(domainName) {
        const self = this;
        self.domainValidOrThrow(domainName);
        return `/live/${domainName}/fullchain.pem`;
    }
    getKeyRelativePathForDomain(domainName) {
        const self = this;
        self.domainValidOrThrow(domainName);
        return `/live/${domainName}/privkey.pem`;
    }
    enableSsl(domainName) {
        const self = this;
        Logger_1.default.d(`Enabling SSL for ${domainName}`);
        return Promise.resolve()
            .then(function () {
            self.domainValidOrThrow(domainName);
            return self.ensureDomainHasDirectory(domainName);
        })
            .then(function () {
            const cmd = [
                'certbot',
                'certonly',
                '--webroot',
                '-w',
                `${WEBROOT_PATH_IN_CERTBOT}/${domainName}`,
                '-d',
                domainName,
            ];
            if (shouldUseStaging) {
                cmd.push('--staging');
            }
            return self.runCommand(cmd).then(function (output) {
                Logger_1.default.d(output);
                if (output.indexOf('Congratulations! Your certificate and chain have been saved') >= 0) {
                    return true;
                }
                if (output.indexOf('Certificate not yet due for renewal; no action taken') >= 0) {
                    return true;
                }
                throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.VERIFICATION_FAILED, `Unexpected output when enabling SSL for${domainName} with ACME Certbot \n ${output}`);
            });
        });
    }
    ensureRegistered(emailAddress) {
        const self = this;
        return Promise.resolve()
            .then(function () {
            // Creds used to be saved at
            // /etc/letencrypt/accounts/acme-v01.api.letsencrypt.org/directory/9fc95dbca2f0b877
            // After moving to 0.29.1, Certbot started using v2 API. and this path is no longer valid.
            // Instead, they use v02 path. However, old installations who registered with v1, will remain in the same directory
            const cmd = [
                'certbot',
                'register',
                '--email',
                emailAddress,
                '--agree-tos',
                '--no-eff-email',
            ];
            if (shouldUseStaging) {
                cmd.push('--staging');
            }
            return self.runCommand(cmd);
        })
            .then(function (registerOutput) {
            if (registerOutput.indexOf('Your account credentials have been saved in your Certbot') >= 0) {
                return true;
            }
            if (registerOutput.indexOf('There is an existing account') >= 0) {
                return true;
            }
            throw new Error(`Unexpected output when registering with ACME Certbot \n ${registerOutput}`);
        });
    }
    /*
  Certificate Name: customdomain-another.hm2.caprover.com
    Domains: customdomain-another.hm2.caprover.com
    Expiry Date: 2019-03-22 04:22:55+00:00 (VALID: 81 days)
    Certificate Path: /etc/letsencrypt/live/customdomain-another.hm2.caprover.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/customdomain-another.hm2.caprover.com/privkey.pem
  Certificate Name: testing.cp.hm.caprover.com
    Domains: testing.cp.hm.caprover.com
    Expiry Date: 2019-03-21 18:42:17+00:00 (VALID: 81 days)
    Certificate Path: /etc/letsencrypt/live/testing.cp.hm.caprover.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/testing.cp.hm.caprover.com/privkey.pem
  Certificate Name: registry.cp.hm.caprover.com
    Domains: registry.cp.hm.caprover.com
    Expiry Date: 2019-03-25 04:56:45+00:00 (VALID: 84 days)
    Certificate Path: /etc/letsencrypt/live/registry.cp.hm.caprover.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/registry.cp.hm.caprover.com/privkey.pem
  Certificate Name: captain.cp.hm.caprover.com
    Domains: captain.cp.hm.caprover.com
    Expiry Date: 2019-03-20 22:25:50+00:00 (VALID: 80 days)
    Certificate Path: /etc/letsencrypt/live/captain.cp.hm.caprover.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/captain.cp.hm.caprover.com/privkey.pem
  Certificate Name: testing2.cp.hm.caprover.com
    Domains: testing2.cp.hm.caprover.com
    Expiry Date: 2019-03-21 18:42:55+00:00 (VALID: 81 days)
    Certificate Path: /etc/letsencrypt/live/testing2.cp.hm.caprover.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/testing2.cp.hm.caprover.com/privkey.pem

*/
    ensureAllCurrentlyRegisteredDomainsHaveDirs() {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            return self
                .runCommand(['certbot', 'certificates'])
                .then(function (output) {
                const lines = output.split('\n');
                const domains = [];
                lines.forEach((l) => {
                    if (l.indexOf('Certificate Name:') >= 0) {
                        domains.push(l.replace('Certificate Name:', '').trim());
                    }
                });
                return domains;
            });
        })
            .then(function (allDomains) {
            const p = Promise.resolve();
            allDomains.forEach((d) => {
                p.then(function () {
                    return self.ensureDomainHasDirectory(d);
                });
            });
            return p;
        });
    }
    lock() {
        if (this.isOperationInProcess) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Another operation is in process for Certbot. Please wait a few seconds and try again.');
        }
        this.isOperationInProcess = true;
    }
    unlock() {
        this.isOperationInProcess = false;
    }
    runCommand(cmd) {
        const dockerApi = this.dockerApi;
        const self = this;
        return Promise.resolve().then(function () {
            self.lock();
            const nonInterActiveCommand = [...cmd, '--non-interactive'];
            return dockerApi
                .executeCommand(CaptainConstants_1.default.certbotServiceName, nonInterActiveCommand)
                .then(function (data) {
                self.unlock();
                Logger_1.default.dev(data);
                return data;
            })
                .catch(function (error) {
                self.unlock();
                throw error;
            });
        });
    }
    ensureDomainHasDirectory(domainName) {
        return Promise.resolve() //
            .then(function () {
            return fs.ensureDir(`${WEBROOT_PATH_IN_CAPTAIN}/${domainName}`);
        });
    }
    renewAllCerts() {
        const self = this;
        /*
        From Certbot docs:
            This command attempts to renew all previously-obtained certificates that expire in less than 30 days.
            The same plugin and options that were used at the time the certificate was originally issued will be
            used for the renewal attempt, unless you specify other plugins or options. Unlike certonly, renew
            acts on multiple certificates and always takes into account whether each one is near expiry. Because
            of this, renew is suitable (and designed) for automated use, to allow your system to automatically
            renew each certificate when appropriate. Since renew only renews certificates that are near expiry
            it can be run as frequently as you want - since it will usually take no action.
         */
        const cmd = ['certbot', 'renew'];
        if (shouldUseStaging) {
            cmd.push('--staging');
        }
        return Promise.resolve() //
            .then(function () {
            return self.ensureAllCurrentlyRegisteredDomainsHaveDirs();
        })
            .then(function () {
            return self.runCommand(cmd);
        })
            .then(function (output) {
            // Ignore output :)
        })
            .catch(function (err) {
            Logger_1.default.e(err);
        });
    }
    init(myNodeId) {
        const dockerApi = this.dockerApi;
        const self = this;
        function createCertbotServiceOnNode(nodeId) {
            Logger_1.default.d('Creating Certbot service');
            return dockerApi
                .createServiceOnNodeId(CaptainConstants_1.default.certbotImageName, CaptainConstants_1.default.certbotServiceName, undefined, nodeId, undefined, undefined, undefined)
                .then(function () {
                Logger_1.default.d('Waiting for Certbot...');
                return Utils_1.default.getDelayedPromise(12000);
            });
        }
        return Promise.resolve()
            .then(function () {
            return fs.ensureDir(CaptainConstants_1.default.letsEncryptEtcPath);
        })
            .then(function () {
            return fs.ensureDir(CaptainConstants_1.default.letsEncryptLibPath);
        })
            .then(function () {
            return fs.ensureDir(WEBROOT_PATH_IN_CAPTAIN);
        })
            .then(function () {
            return dockerApi.isServiceRunningByName(CaptainConstants_1.default.certbotServiceName);
        })
            .then(function (isRunning) {
            if (isRunning) {
                Logger_1.default.d('Captain Certbot is already running.. ');
                return dockerApi.getNodeIdByServiceName(CaptainConstants_1.default.certbotServiceName, 0);
            }
            else {
                Logger_1.default.d('No Captain Certbot service is running. Creating one...');
                return createCertbotServiceOnNode(myNodeId) //
                    .then(function () {
                    return myNodeId;
                });
            }
        })
            .then(function (nodeId) {
            if (nodeId !== myNodeId) {
                Logger_1.default.d('Captain Certbot is running on a different node. Removing...');
                return dockerApi
                    .removeServiceByName(CaptainConstants_1.default.certbotServiceName)
                    .then(function () {
                    Logger_1.default.d('Waiting for Certbot to be removed...');
                    return Utils_1.default.getDelayedPromise(10000);
                })
                    .then(function () {
                    return createCertbotServiceOnNode(myNodeId).then(function () {
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
            return dockerApi.updateService(CaptainConstants_1.default.certbotServiceName, CaptainConstants_1.default.certbotImageName, [
                {
                    hostPath: CaptainConstants_1.default.letsEncryptEtcPath,
                    containerPath: '/etc/letsencrypt',
                },
                {
                    hostPath: CaptainConstants_1.default.letsEncryptLibPath,
                    containerPath: '/var/lib/letsencrypt',
                },
                {
                    hostPath: WEBROOT_PATH_IN_CAPTAIN,
                    containerPath: WEBROOT_PATH_IN_CERTBOT,
                },
            ], 
            // No need to certbot to be connected to the network
            undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
        })
            .then(function () {
            return self.ensureAllCurrentlyRegisteredDomainsHaveDirs();
        });
    }
}
exports.default = CertbotManager;
//# sourceMappingURL=CertbotManager.js.map