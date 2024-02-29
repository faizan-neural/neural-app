"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const Logger_1 = require("../utils/Logger");
const SshClientImport = require("ssh2");
const SshClient = SshClientImport.Client;
class DockerUtils {
    static joinDockerNode(dockerApi, sshUser, sshPort, captainIpAddress, isManager, remoteNodeIpAddress, privateKey) {
        const remoteUserName = sshUser; // Docker requires root access. It has to be root or any non root user that can run Docker without sudo
        return Promise.resolve()
            .then(function () {
            return dockerApi.getJoinToken(isManager);
        })
            .then(function (token) {
            return new Promise(function (resolve, reject) {
                const conn = new SshClient();
                conn.on('error', function (err) {
                    Logger_1.default.e(err);
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'SSH Connection error!!'));
                })
                    .on('ready', function () {
                    Logger_1.default.d('SSH Client :: ready');
                    conn.exec(`${CaptainConstants_1.default.disableFirewallCommand} ${dockerApi.createJoinCommand(captainIpAddress, token, remoteNodeIpAddress)}`, function (err, stream) {
                        if (err) {
                            Logger_1.default.e(err);
                            reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'SSH Running command failed!!'));
                            return;
                        }
                        let hasExisted = false;
                        stream
                            .on('close', function (code, signal) {
                            Logger_1.default.d(`Stream :: close :: code: ${code}, signal: ${signal}`);
                            conn.end();
                            if (hasExisted) {
                                return;
                            }
                            hasExisted = true;
                            resolve();
                        })
                            .on('data', function (data) {
                            Logger_1.default.d(`STDOUT: ${data}`);
                        })
                            .stderr.on('data', function (data) {
                            Logger_1.default.e(`STDERR: ${data}`);
                            if (hasExisted) {
                                return;
                            }
                            hasExisted = true;
                            reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Error during setup: ${data}`));
                        });
                    });
                })
                    .connect({
                    host: remoteNodeIpAddress,
                    port: sshPort,
                    username: remoteUserName,
                    privateKey: privateKey,
                });
            });
        });
    }
}
exports.default = DockerUtils;
//# sourceMappingURL=DockerUtils.js.map