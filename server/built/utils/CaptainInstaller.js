"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.install = void 0;
const externalIp = require("public-ip");
const DockerApi_1 = require("../docker/DockerApi");
const BackupManager_1 = require("../user/system/BackupManager");
const CaptainConstants_1 = require("./CaptainConstants");
const EnvVars_1 = require("./EnvVars");
const http = require("http");
const request = require("request");
// internal IP returns Public IP if the machine is not behind a NAT
// No need to directly use Public IP.
function checkSystemReq() {
    console.log("By pass requirement check");
    // return Promise.resolve()
    //     .then(function () {
    //     return DockerApi_1.default.get().getDockerVersion();
    // })
    //     .then(function (output) {
    //     console.log(' ');
    //     console.log(' ');
    //     console.log(' ');
    //     console.log(' >>> Checking System Compatibility <<<');
    //     const ver = output.Version.split('.');
    //     const maj = Number(ver[0]);
    //     const min = Number(ver[1]);
    //     let versionOk = false;
    //     if (maj > 17) {
    //         versionOk = true;
    //     }
    //     else if (maj === 17 && min >= 6) {
    //         versionOk = true;
    //     }
    //     if (versionOk) {
    //         console.log('   Docker Version passed.');
    //     }
    //     else {
    //         console.log('Warning!! Minimum Docker version is 17.06.x CapRover may not run properly on your Docker version.');
    //     }
    //     return DockerApi_1.default.get().getDockerInfo();
    // })
    //     .then(function (output) {
    //     if (output.OperatingSystem.toLowerCase().indexOf('ubuntu') < 0) {
    //         console.log('******* Warning *******    CapRover and Docker work best on Ubuntu - specially when it comes to storage drivers.');
    //     }
    //     else {
    //         console.log('   Ubuntu detected.');
    //     }
    //     const totalMemInMb = Math.round(output.MemTotal / 1000.0 / 1000.0);
    //     if (totalMemInMb < 1000) {
    //         console.log('******* Warning *******   With less than 1GB RAM, Docker builds might fail, see CapRover system requirements.');
    //     }
    //     else {
    //         console.log(`   Total RAM ${totalMemInMb} MB`);
    //     }
    // })
    //     .catch(function (error) {
    //     console.log(' ');
    //     console.log(' ');
    //     console.log('**** WARNING!!!! System requirement check failed!  *****');
    //     console.log(' ');
    //     console.log(' ');
    //     console.error(error);
    // });
}
const FIREWALL_PASSED = 'firewall-passed';
function startServerOnPort_80_443_3000() {
    return Promise.resolve().then(function () {
        http.createServer(function (req, res) {
            res.writeHead(200, {
                'Content-Type': 'text/plain',
            });
            res.write(FIREWALL_PASSED);
            res.end();
        }).listen(80);
        http.createServer(function (req, res) {
            res.writeHead(200, {
                'Content-Type': 'text/plain',
            });
            res.write(FIREWALL_PASSED);
            res.end();
        }).listen(443);
        http.createServer(function (req, res) {
            res.writeHead(200, {
                'Content-Type': 'text/plain',
            });
            res.write(FIREWALL_PASSED);
            res.end();
        }).listen(3000);
        return new Promise(function (resolve) {
            setTimeout(function () {
                resolve();
            }, 4000);
        });
    });
}
function checkPortOrThrow(ipAddr, portToTest) {
    if (CaptainConstants_1.default.isDebug || !!EnvVars_1.default.BY_PASS_PROXY_CHECK) {
        return Promise.resolve();
    }
    function printError() {
        console.log(' ');
        console.log(' ');
        console.log('Are you trying to run CapRover on a local machine or a machine without a public IP?');
        console.log('In that case, you need to add this to your installation command:');
        console.log("    -e MAIN_NODE_IP_ADDRESS='127.0.0.1'   ");
        console.log(' ');
        console.log(' ');
        console.log(' ');
        console.log('Otherwise, if you are running CapRover on a VPS with public IP:');
        console.log(`Your firewall may have been blocking an in-use port: ${portToTest}`);
        console.log('A simple solution on Ubuntu systems is to run "ufw disable" (security risk)');
        console.log('Or [recommended] just allowing necessary ports:');
        console.log(CaptainConstants_1.default.disableFirewallCommand);
        console.log('     ');
        console.log('     ');
        console.log('See docs for more details on how to fix firewall issues');
        console.log(' ');
        console.log('Finally, if you are an advanced user, and you want to bypass this check (NOT RECOMMENDED),');
        console.log("you can append the docker command with an addition flag: -e BY_PASS_PROXY_CHECK='TRUE'");
        console.log(' ');
        console.log(' ');
    }
    return new Promise(function (resolve, reject) {
        let finished = false;
        setTimeout(function () {
            if (finished) {
                return;
            }
            finished = true;
            printError();
            reject(new Error(`Port timed out: ${portToTest}`));
        }, 5000);
        request(`http://${ipAddr}:${portToTest}`, function (error, response, body) {
            if (finished) {
                return;
            }
            finished = true;
            if (body + '' === FIREWALL_PASSED) {
                resolve();
            }
            else {
                printError();
                reject(new Error(`Port seems to be closed: ${portToTest}`));
            }
        });
    });
}
function printTroubleShootingUrl() {
    console.log('     ');
    console.log(' Installation of CapRover is starting...     ');
    console.log('For troubleshooting, please see: https://caprover.com/docs/troubleshooting.html');
    console.log('     ');
    console.log('     ');
}
let myIp4;
function install() {
    const backupManger = new BackupManager_1.default();
    Promise.resolve()
        .then(function () {
        if (!EnvVars_1.default.ACCEPTED_TERMS) {
            throw new Error(`
                Add the following to the installer line:
                -e ACCEPTED_TERMS=true
                
                Terms of service must be accepted before installation, view them here: 
                https://github.com/caprover/caprover/blob/master/TERMS_AND_CONDITIONS.md
                `.trim());
        }
    })
        .then(function () {
        printTroubleShootingUrl();
    })
        .then(function () {
        return checkSystemReq();
    })
        .then(function () {
        if (EnvVars_1.default.MAIN_NODE_IP_ADDRESS) {
            return EnvVars_1.default.MAIN_NODE_IP_ADDRESS;
        }
        return externalIp.v4();
    })
        .then(function (ip4) {
        if (!ip4) {
            throw new Error('Something went wrong. No IP address was retrieved.');
        }
        if (CaptainConstants_1.default.isDebug) {
            return new Promise(function (resolve, reject) {
                DockerApi_1.default.get()
                    .swarmLeave(true)
                    .then(function (ignore) {
                    resolve(ip4);
                })
                    .catch(function (error) {
                    if (error && error.statusCode === 503) {
                        resolve(ip4);
                    }
                    else {
                        reject(error);
                    }
                });
            });
        }
        else {
            return ip4;
        }
    })
        .then(function (ip4) {
        myIp4 = `${ip4}`;
        return startServerOnPort_80_443_3000();
    })
        .then(function () {
        return checkPortOrThrow(myIp4, 80);
    })
        .then(function () {
        return checkPortOrThrow(myIp4, 443);
    })
        .then(function () {
        return checkPortOrThrow(myIp4, 3000);
    })
        .then(function () {
        const imageName = CaptainConstants_1.default.configs.nginxImageName;
        console.log(`Pulling: ${imageName}`);
        return DockerApi_1.default.get().pullImage(imageName, undefined);
    })
        .then(function () {
        const imageName = CaptainConstants_1.default.configs.appPlaceholderImageName;
        console.log(`Pulling: ${imageName}`);
        return DockerApi_1.default.get().pullImage(imageName, undefined);
    })
        .then(function () {
        const imageName = CaptainConstants_1.default.certbotImageName;
        console.log(`Pulling: ${imageName}`);
        return DockerApi_1.default.get().pullImage(imageName, undefined);
    })
        .then(function () {
        return backupManger.checkAndPrepareRestoration();
    })
        .then(function () {
        if (CaptainConstants_1.default.configs.useExistingSwarm) {
            return DockerApi_1.default.get().ensureSwarmExists();
        }
        return DockerApi_1.default.get().initSwarm(myIp4);
    })
        .then(function (swarmId) {
        console.log(`Swarm started: ${swarmId}`);
        return backupManger.startRestorationIfNeededPhase1(myIp4);
    })
        .then(function () {
        return DockerApi_1.default.get().getLeaderNodeId();
    })
        .then(function (nodeId) {
        const volumeToMount = [
            {
                hostPath: CaptainConstants_1.default.captainBaseDirectory,
                containerPath: CaptainConstants_1.default.captainBaseDirectory,
            },
        ];
        const env = [];
        env.push({
            key: EnvVars_1.default.keys.IS_CAPTAIN_INSTANCE,
            value: '1',
        });
        if (EnvVars_1.default.DEFAULT_PASSWORD) {
            env.push({
                key: EnvVars_1.default.keys.DEFAULT_PASSWORD,
                value: EnvVars_1.default.DEFAULT_PASSWORD,
            });
        }
        if (EnvVars_1.default.CAPTAIN_DOCKER_API) {
            env.push({
                key: EnvVars_1.default.keys.CAPTAIN_DOCKER_API,
                value: EnvVars_1.default.CAPTAIN_DOCKER_API,
            });
        }
        // else {
        //     volumeToMount.push({
        //         hostPath: CaptainConstants_1.default.dockerSocketPath,
        //         containerPath: CaptainConstants_1.default.dockerSocketPath,
        //     });
        // }
        if (EnvVars_1.default.CAPTAIN_BASE_DIRECTORY) {
            env.push({
                key: EnvVars_1.default.keys.CAPTAIN_BASE_DIRECTORY,
                value: EnvVars_1.default.CAPTAIN_BASE_DIRECTORY,
            });
        }
        const ports = [];
        let captainNameAndVersion = `${CaptainConstants_1.default.configs.publishedNameOnDockerHub}:${CaptainConstants_1.default.configs.version}`;
        if (CaptainConstants_1.default.isDebug) {
            captainNameAndVersion =
                CaptainConstants_1.default.configs.publishedNameOnDockerHub; // debug doesn't have version.
            env.push({
                key: EnvVars_1.default.keys.CAPTAIN_IS_DEBUG,
                value: EnvVars_1.default.CAPTAIN_IS_DEBUG + '',
            });
            volumeToMount.push({
                hostPath: CaptainConstants_1.default.debugSourceDirectory,
                containerPath: CaptainConstants_1.default.sourcePathInContainer,
            });
            ports.push({
                containerPort: 38000,
                hostPort: 38000,
            });
        }
        ports.push({
            protocol: 'tcp',
            publishMode: 'host',
            containerPort: CaptainConstants_1.default.captainServiceExposedPort,
            hostPort: CaptainConstants_1.default.captainServiceExposedPort,
        });
        return DockerApi_1.default.get().createServiceOnNodeId(captainNameAndVersion, CaptainConstants_1.default.captainServiceName, ports, nodeId, volumeToMount, env, {
            Reservation: {
                MemoryBytes: 100 * 1024 * 1024,
            },
        });
    })
        .then(function () {
        console.log('*** CapRover is initializing ***');
        console.log('Please wait at least 60 seconds before trying to access CapRover.');
    })
        .catch(function (error) {
        console.log('Installation failed.');
        console.error(error);
    })
        .then(function () {
        process.exit();
    });
}
exports.install = install;
//# sourceMappingURL=CaptainInstaller.js.map