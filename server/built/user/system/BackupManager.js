"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SshClientImport = require("ssh2");
const child_process_1 = require("child_process");
const fs = require("fs-extra");
const moment = require("moment");
const path = require("path");
const tar = require("tar");
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const DockerApi_1 = require("../../docker/DockerApi");
const DockerUtils_1 = require("../../docker/DockerUtils");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const Logger_1 = require("../../utils/Logger");
const Utils_1 = require("../../utils/Utils");
const Authenticator_1 = require("../Authenticator");
const SshClient = SshClientImport.Client;
const CURRENT_NODE_DONT_CHANGE = 'CURRENT_NODE_DONT_CHANGE';
const IP_PLACEHOLDER = 'replace-me-with-new-ip-or-empty-see-docs';
const BACKUP_JSON = 'backup.json';
const RESTORE_INSTRUCTIONS = 'restore-instructions.json';
const RESTORE_INSTRUCTIONS_ABS_PATH = `${CaptainConstants_1.default.restoreDirectoryPath}/${RESTORE_INSTRUCTIONS}`;
const BACKUP_META_DATA_ABS_PATH = `${CaptainConstants_1.default.restoreDirectoryPath}/meta/${BACKUP_JSON}`;
class BackupManager {
    constructor() {
        //
    }
    lock() {
        if (this.longOperationInProgress) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Another operation is in process for Certbot. Please wait a few seconds and try again.');
        }
        this.longOperationInProgress = true;
    }
    unlock() {
        this.longOperationInProgress = false;
    }
    isRunning() {
        return !!this.longOperationInProgress;
    }
    startRestorationIfNeededPhase1(captainIpAddress) {
        // if (/captain/restore/restore-instructions.json does exist):
        // - Connect all extra nodes via SSH and get their NodeID
        // - Replace the nodeId in apps with the new nodeId based on restore-instructions.json
        // - Create a captain-salt secret using the data in restore
        // - Copy restore files to proper places
        if (!fs.pathExistsSync(RESTORE_INSTRUCTIONS_ABS_PATH))
            return;
        const oldNodeIdToNewIpMap = {};
        return Promise.resolve()
            .then(function () {
            Logger_1.default.d('Starting restoration, phase-1.');
            return fs.readJson(RESTORE_INSTRUCTIONS_ABS_PATH);
        })
            .then(function (restoringInfo) {
            const ps = [];
            restoringInfo.nodesMapping.forEach((n) => {
                let isManager = false;
                restoringInfo.oldNodesForReference.forEach((oldN) => {
                    if (oldN.nodeData.ip === n.oldIp) {
                        oldNodeIdToNewIpMap[oldN.nodeData.nodeId] =
                            n.newIp === CURRENT_NODE_DONT_CHANGE
                                ? captainIpAddress
                                : n.newIp;
                        if (oldN.nodeData.type === 'manager') {
                            isManager = true;
                        }
                    }
                });
                if (n.newIp === CURRENT_NODE_DONT_CHANGE)
                    return;
                const NEW_IP = n.newIp;
                const PRIVATE_KEY_PATH = n.privateKeyPath;
                ps.push(function () {
                    return Promise.resolve()
                        .then(function () {
                        Logger_1.default.d(`Joining other node to swarm: ${NEW_IP}`);
                        return DockerUtils_1.default.joinDockerNode(DockerApi_1.default.get(), 'root', 22, captainIpAddress, isManager, NEW_IP, fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'));
                    })
                        .then(function () {
                        Logger_1.default.d(`Joined swarm: ${NEW_IP}`);
                    })
                        .then(function () {
                        Logger_1.default.d('Waiting 5 seconds...');
                        return Utils_1.default.getDelayedPromise(5000);
                    });
                });
            });
            if (ps.length > 0) {
                Logger_1.default.d('Joining other node to swarm started');
            }
            else {
                Logger_1.default.d('Single node restoration detected.');
            }
            return Utils_1.default.runPromises(ps);
        })
            .then(function () {
            Logger_1.default.d('Waiting for 5 seconds for things to settle...');
            return Utils_1.default.getDelayedPromise(5000);
        })
            .then(function () {
            Logger_1.default.d('Getting nodes info...');
            return DockerApi_1.default.get().getNodesInfo();
        })
            .then(function (nodesInfo) {
            Logger_1.default.d('Remapping nodesId in config...');
            function getNewNodeIdForIp(ip) {
                let nodeId = '';
                nodesInfo.forEach((n) => {
                    if (n.ip === ip)
                        nodeId = n.nodeId;
                });
                if (nodeId)
                    return nodeId;
                throw new Error(`No NodeID found for ${ip}`);
            }
            const configFilePathRestoring = CaptainConstants_1.default.restoreDirectoryPath +
                '/data/config-captain.json';
            const configData = fs.readJsonSync(configFilePathRestoring);
            Object.keys(configData.appDefinitions).forEach((appName) => {
                const oldNodeIdForApp = configData.appDefinitions[appName].nodeId;
                if (!oldNodeIdForApp)
                    return;
                let oldNodeIdFound = false;
                Object.keys(oldNodeIdToNewIpMap).forEach((oldNodeId) => {
                    const newIp = oldNodeIdToNewIpMap[oldNodeId];
                    if (oldNodeIdForApp === oldNodeId) {
                        oldNodeIdFound = true;
                        configData.appDefinitions[appName].nodeId = newIp
                            ? getNewNodeIdForIp(newIp)
                            : ''; // If user removed new IP, it will mean that the user is okay with this node being automatically assigned to a node ID
                    }
                });
                if (!oldNodeIdFound) {
                    throw new Error(`Old nodeId ${oldNodeIdForApp} for app ${appName} is not found in the map.`);
                }
            });
            return fs.outputJson(configFilePathRestoring, configData);
        })
            .then(function () {
            Logger_1.default.d('Config remapping done.');
            return fs.readJson(BACKUP_META_DATA_ABS_PATH);
        })
            .then(function (data) {
            const salt = data.salt;
            if (!salt)
                throw new Error('Something is wrong! Salt is empty in restoring meta file');
            Logger_1.default.d('Setting up salt...');
            return DockerApi_1.default.get().ensureSecret(CaptainConstants_1.default.captainSaltSecretKey, salt);
        })
            .then(function () {
            return fs.move(CaptainConstants_1.default.restoreDirectoryPath + '/data', CaptainConstants_1.default.captainDataDirectory);
        })
            .then(function () {
            Logger_1.default.d('Restoration Phase-1 is completed! Starting the service...');
        });
    }
    startRestorationIfNeededPhase2(captainSalt, ensureAllAppsInited) {
        // if (/captain/restore/restore.json exists) GO TO RESTORE MODE:
        // - Double check salt against "meta/captain-salt"
        // - Iterate over all APPs and make sure they are inited properly
        // - Delete /captain/restore
        // - Wait until things settle (1 minute...)
        return Promise.resolve() //
            .then(function () {
            if (!fs.pathExistsSync(RESTORE_INSTRUCTIONS_ABS_PATH)) {
                return;
            }
            Logger_1.default.d('Running phase-2 of restoration...');
            return Promise.resolve() //
                .then(function () {
                return fs.readJson(BACKUP_META_DATA_ABS_PATH);
            })
                .then(function (data) {
                const restoringSalt = data.salt;
                if (restoringSalt !== captainSalt) {
                    throw new Error(`Salt does not match the restoration data: ${captainSalt} vs  ${restoringSalt}`);
                }
                return ensureAllAppsInited();
            })
                .then(function () {
                Logger_1.default.d('waiting 20 seconds for all services to settle');
                return Utils_1.default.getDelayedPromise(20000);
            })
                .then(function () {
                return fs.remove(CaptainConstants_1.default.restoreDirectoryPath);
            });
        });
    }
    checkAndPrepareRestoration() {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            let promise = Promise.resolve();
            if (fs.pathExistsSync(CaptainConstants_1.default.restoreTarFilePath)) {
                Logger_1.default.d('Backup file found! Starting restoration process...');
                promise = self
                    .extractBackupContentAndRemoveTar() //
                    .then(function () {
                    Logger_1.default.d('Restoration content are extracted.');
                    return self.createRestorationInstructionFile();
                });
            }
            return promise //
                .then(function () {
                if (fs.pathExistsSync(RESTORE_INSTRUCTIONS_ABS_PATH)) {
                    Logger_1.default.d('Resuming restoration from backup...');
                    return self.checkAccessToAllNodesInInstructions(fs.readJsonSync(RESTORE_INSTRUCTIONS_ABS_PATH));
                }
                else {
                    Logger_1.default.d('Fresh installation!');
                }
            });
        });
    }
    checkAccessToAllNodesInInstructions(restoringInfo) {
        const self = this;
        Logger_1.default.d('Processing the restoration instructions...');
        if (!restoringInfo.nodesMapping.length)
            throw new Error('Node Mapping is empty in restoring instructions file!');
        if (restoringInfo.nodesMapping.length !==
            restoringInfo.oldNodesForReference.length) {
            throw new Error('Node Mapping has a different size than the old nodes in restoring instructions file!');
        }
        let currentNodeFound = false;
        restoringInfo.nodesMapping.forEach((n) => {
            if (n.newIp === CURRENT_NODE_DONT_CHANGE) {
                currentNodeFound = true;
            }
        });
        if (!currentNodeFound)
            throw new Error(`You are not supposed to change ${CURRENT_NODE_DONT_CHANGE}`);
        const connectingFuncs = [];
        const newIps = [];
        restoringInfo.nodesMapping.forEach((n) => {
            if (!Utils_1.default.isValidIp(n.oldIp)) {
                throw new Error(`${n.oldIp} is not a valid IP`);
            }
            if (n.newIp === CURRENT_NODE_DONT_CHANGE)
                return;
            if (n.newIp) {
                if (n.newIp === IP_PLACEHOLDER) {
                    Logger_1.default.d('***       MULTI-NODE RESTORATION DETECTED        ***');
                    Logger_1.default.d('*** THIS ERROR IS EXPECTED. SEE DOCS FOR DETAILS ***');
                    Logger_1.default.d(`See backup docs! You must replace the place holder: ${IP_PLACEHOLDER} in ${RESTORE_INSTRUCTIONS_ABS_PATH}`);
                    process.exit(1);
                    throw new Error('See docs for details');
                }
                if (!Utils_1.default.isValidIp(n.newIp)) {
                    throw new Error(`${n.newIp} is not a valid IP`);
                }
                if (newIps.indexOf(n.newIp) >= 0) {
                    throw new Error(`${n.newIp} is repeated!!`);
                }
                newIps.push(n.newIp);
                connectingFuncs.push(function () {
                    return self.checkSshRoot(n.newIp, n.user, n.privateKeyPath);
                });
            }
        });
        Logger_1.default.d('Processing restoration instructions is done');
        if (connectingFuncs.length > 0)
            Logger_1.default.d('Checking connectivity to other nodes...');
        return Utils_1.default.runPromises(connectingFuncs);
    }
    checkSshRoot(remoteNodeIpAddress, user, privateKeyPath) {
        return Promise.resolve() //
            .then(function () {
            if (!remoteNodeIpAddress)
                throw new Error('ip cannot be empty');
            if (!user)
                throw new Error('user cannot be empty');
            if (!privateKeyPath)
                throw new Error('privateKeyPath cannot be empty');
            if (!fs.pathExistsSync(privateKeyPath))
                throw new Error(`private key is not found at ${privateKeyPath}`);
            return fs.readFile(privateKeyPath, 'utf8');
        })
            .then(function (privateKey) {
            Logger_1.default.d(`Testing ${remoteNodeIpAddress}`);
            return new Promise(function (resolve, reject) {
                const conn = new SshClient();
                conn.on('error', function (err) {
                    Logger_1.default.e(err);
                    reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'SSH Connection error!!'));
                })
                    .on('ready', function () {
                    Logger_1.default.d('SSH Client :: ready');
                    conn.exec('docker info', function (err, stream) {
                        if (err) {
                            Logger_1.default.e(err);
                            reject(ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'SSH Running command failed!!'));
                            return;
                        }
                        const dataReceived = [];
                        let hasExisted = false;
                        stream
                            .on('close', function (code, signal) {
                            Logger_1.default.d(`Stream :: close :: code: ${code}, signal: ${signal}`);
                            conn.end();
                            if (hasExisted) {
                                return;
                            }
                            hasExisted = true;
                            resolve(dataReceived.join(''));
                        })
                            .on('data', function (data) {
                            Logger_1.default.d(`STDOUT: ${data}`);
                            dataReceived.push(data);
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
                    port: 22,
                    username: user,
                    privateKey: privateKey,
                });
            });
        })
            .then(function (data) {
            if (data.toUpperCase().indexOf('SWARM: INACTIVE') < 0) {
                throw new Error(`Either not root or already part of swarm? The output must include "Swarm: inactive" from ${remoteNodeIpAddress}`);
            }
            Logger_1.default.d(`Passed ${remoteNodeIpAddress}`);
        });
    }
    /**
     * By the time this method finishes, the instructions will be ready at
     *
     * /captain/restore/restore-instructions.json
     *
     */
    createRestorationInstructionFile() {
        const self = this;
        return Promise.resolve() //
            .then(function () {
            const dirPath = CaptainConstants_1.default.restoreDirectoryPath;
            if (!fs.statSync(dirPath).isDirectory())
                throw new Error('restore directory is not a directory!!');
            if (fs.pathExistsSync(RESTORE_INSTRUCTIONS_ABS_PATH)) {
                throw new Error('Restore instruction already exists! Cleanup your /captain directory and start over.');
            }
            return Promise.resolve() //
                .then(function () {
                Logger_1.default.d('Reading backup meta-data...');
                const metaData = fs.readJsonSync(BACKUP_META_DATA_ABS_PATH);
                const configData = fs.readJsonSync(CaptainConstants_1.default.restoreDirectoryPath +
                    '/data/config-captain.json');
                Logger_1.default.d('Creating the restoration instruction file...');
                return fs.outputFile(RESTORE_INSTRUCTIONS_ABS_PATH, JSON.stringify(self.createRestoreInstructionData(metaData, configData), undefined, 2));
            });
        });
    }
    createRestoreInstructionData(metaContent, configData) {
        const ret = {
            nodesMapping: [],
            oldNodesForReference: [],
        };
        const oldServers = metaContent.nodes;
        oldServers.forEach((s) => {
            if (s.isLeader) {
                ret.nodesMapping.push({
                    newIp: CURRENT_NODE_DONT_CHANGE,
                    oldIp: s.ip,
                    privateKeyPath: '',
                    user: '',
                });
            }
            else {
                ret.nodesMapping.push({
                    newIp: IP_PLACEHOLDER,
                    oldIp: s.ip,
                    privateKeyPath: CaptainConstants_1.default.captainBaseDirectory + '/id_rsa',
                    user: 'root',
                });
            }
            const apps = [];
            Object.keys(configData.appDefinitions).forEach((appName) => {
                if (configData.appDefinitions[appName].nodeId === s.nodeId) {
                    apps.push(appName);
                }
            });
            ret.oldNodesForReference.push({
                nodeData: s,
                appsLockOnThisNode: apps,
            });
        });
        return ret;
    }
    extractBackupContentAndRemoveTar() {
        if (!fs.statSync(CaptainConstants_1.default.restoreTarFilePath).isFile())
            throw new Error('restore tar file is not a file!!');
        return Promise.resolve() //
            .then(function () {
            return fs.ensureDir(CaptainConstants_1.default.restoreDirectoryPath);
        })
            .then(function () {
            return tar
                .extract({
                file: CaptainConstants_1.default.restoreTarFilePath,
                cwd: CaptainConstants_1.default.restoreDirectoryPath,
            })
                .then(function () {
                return fs.remove(CaptainConstants_1.default.restoreTarFilePath);
            })
                .then(function () {
                return Promise.resolve(true);
            });
        });
    }
    createBackup(iBackupCallbacks) {
        const self = this;
        const certbotManager = iBackupCallbacks.getCertbotManager();
        return Promise.resolve() //
            .then(function () {
            certbotManager.lock();
            return self
                .createBackupInternal(iBackupCallbacks)
                .then(function (data) {
                certbotManager.unlock();
                return data;
            })
                .catch(function (err) {
                certbotManager.unlock();
                throw err;
            });
        });
    }
    createBackupInternal(iBackupCallbacks) {
        const self = this;
        let nodeInfo;
        return Promise.resolve() //
            .then(function () {
            self.lock();
            // Check if exist /captain/temp/backup, delete directory
            // Create directory /captain/temp/backup/raw
            // Copy /captain/data to .../backup/raw/data
            // Ensure .../backup/raw/meta/backup.json
            // Create tar file FROM: .../backup/raw/   TO: .../backup/backup.tar
            const RAW = CaptainConstants_1.default.captainRootDirectoryBackup + '/raw';
            Logger_1.default.d('Creating backup...');
            return Promise.resolve() //
                .then(function () {
                return self.deleteBackupDirectoryIfExists();
            })
                .then(function () {
                return fs.ensureDir(RAW);
            })
                .then(function () {
                Logger_1.default.d(`Copying data to ${RAW}`);
                const dest = RAW + '/data';
                // We cannot use fs.copy as it doesn't properly copy the broken SymLink which might exist in LetsEncrypt
                // https://github.com/jprichardson/node-fs-extra/issues/638
                return new Promise(function (resolve, reject) {
                    const child = (0, child_process_1.exec)(`mkdir -p {dest} && cp -rp  ${CaptainConstants_1.default.captainDataDirectory} ${dest}`);
                    child.addListener('error', reject);
                    child.addListener('exit', resolve);
                });
            })
                .then(function () {
                return iBackupCallbacks.getNodesInfo();
            })
                .then(function (nodes) {
                Logger_1.default.d(`Copying meta to ${RAW}`);
                nodeInfo = nodes;
                return self.saveMetaFile(`${RAW}/meta/${BACKUP_JSON}`, {
                    salt: iBackupCallbacks.getCaptainSalt(),
                    nodes: nodes,
                });
            })
                .then(function () {
                const tarFilePath = CaptainConstants_1.default.captainRootDirectoryBackup +
                    '/backup.tar';
                Logger_1.default.d(`Creating tar file: ${tarFilePath}`);
                return tar
                    .c({
                    file: tarFilePath,
                    cwd: RAW,
                }, ['./'])
                    .then(function () {
                    const fileSizeInMb = Math.ceil(fs.statSync(tarFilePath).size / 1000000);
                    Logger_1.default.d(`Tar file created. File Size: ${fileSizeInMb} MB`);
                    return tarFilePath;
                });
            })
                .then(function (tarFilePath) {
                const namespace = CaptainConstants_1.default.rootNameSpace;
                let mainIP = '';
                nodeInfo.forEach((n) => {
                    if (n.isLeader)
                        mainIP = (n.ip || '').split('.').join('_');
                });
                const now = moment();
                const newName = `${CaptainConstants_1.default.captainDownloadsDirectory}/${namespace}/caprover-backup-${`${now.format('YYYY_MM_DD-HH_mm_ss')}-${now.valueOf()}`}${`-ip-${mainIP}.tar`}`;
                fs.moveSync(tarFilePath, newName);
                setTimeout(() => {
                    try {
                        fs.removeSync(newName);
                    }
                    catch (err) {
                        // nom nom
                    }
                }, 1000 * 3600 * 2);
                return Authenticator_1.default.getAuthenticator(namespace).getDownloadToken(path.basename(newName));
            })
                .then(function (token) {
                return self
                    .deleteBackupDirectoryIfExists()
                    .then(function () {
                    self.unlock();
                    return {
                        downloadToken: token,
                    };
                });
            })
                .catch(function (err) {
                self.unlock();
                throw err;
            });
        });
    }
    saveMetaFile(absPath, metaData) {
        return fs.outputJson(absPath, metaData);
    }
    deleteBackupDirectoryIfExists() {
        return Promise.resolve() //
            .then(function () {
            if (fs.existsSync(CaptainConstants_1.default.captainRootDirectoryBackup)) {
                return fs.remove(CaptainConstants_1.default.captainRootDirectoryBackup);
            }
        });
    }
}
exports.default = BackupManager;
//# sourceMappingURL=BackupManager.js.map