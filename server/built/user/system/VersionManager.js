"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request");
const axios_1 = require("axios");
const DockerApi_1 = require("../../docker/DockerApi");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const Logger_1 = require("../../utils/Logger");
class VersionManager {
    constructor() {
        const dockerApi = DockerApi_1.default.get();
        this.dockerApi = dockerApi;
    }
    getCaptainImageTagsFromOfficialApi(currentVersion) {
        // reach out to api.v2.caprover.com/v2/versionInfo?currentVersion=1.5.3
        // response should be currentVersion, latestVersion, canUpdate, and changeLogMessage
        return Promise.resolve() //
            .then(function () {
            return axios_1.default.get('https://api-v1.caprover.com/v2/versionInfo', {
                params: {
                    currentVersion: currentVersion,
                },
            });
        })
            .then(function (responseObj) {
            const resp = responseObj.data;
            if (resp.status !== 100) {
                throw new Error(`Bad response from the upstream version info: ${resp.status}`);
            }
            const data = resp.data;
            return {
                currentVersion: data.currentVersion + '',
                latestVersion: data.latestVersion + '',
                changeLogMessage: data.changeLogMessage + '',
                canUpdate: !!data.canUpdate,
            };
        })
            .catch(function (error) {
            Logger_1.default.e(error);
            return Promise.resolve({
                currentVersion: currentVersion + '',
                latestVersion: currentVersion + '',
                changeLogMessage: '',
                canUpdate: false,
            });
        });
    }
    getCaptainImageTags() {
        if ('caprover/caprover' ===
            CaptainConstants_1.default.configs.publishedNameOnDockerHub) {
            // For the official image use our official API.
            return this.getCaptainImageTagsFromOfficialApi(CaptainConstants_1.default.configs.version);
        }
        // Fallback for unofficial images to DockerHub, knowing that:
        // - The API contract is not guaranteed to always be the same, it might break in the future
        // - This method does not return the changeLogMessage
        const url = `https://hub.docker.com/v2/repositories/${CaptainConstants_1.default.configs.publishedNameOnDockerHub}/tags`;
        return new Promise(function (resolve, reject) {
            request(url, function (error, response, body) {
                if (CaptainConstants_1.default.isDebug) {
                    resolve(['v0.0.1']);
                    return;
                }
                if (error) {
                    reject(error);
                }
                else if (!body || !JSON.parse(body).results) {
                    reject(new Error('Received empty body or no result for version list on docker hub.'));
                }
                else {
                    const results = JSON.parse(body).results;
                    const tags = [];
                    for (let idx = 0; idx < results.length; idx++) {
                        tags.push(results[idx].name);
                    }
                    resolve(tags);
                }
            });
        }).then(function (tagList) {
            const currentVersion = CaptainConstants_1.default.configs.version.split('.');
            let latestVersion = CaptainConstants_1.default.configs.version.split('.');
            let canUpdate = false;
            for (let i = 0; i < tagList.length; i++) {
                const tag = tagList[i].split('.');
                if (tag.length !== 3) {
                    continue;
                }
                if (Number(tag[0]) > Number(currentVersion[0])) {
                    canUpdate = true;
                    latestVersion = tag;
                    break;
                }
                else if (Number(tag[0]) === Number(currentVersion[0]) &&
                    Number(tag[1]) > Number(currentVersion[1])) {
                    canUpdate = true;
                    latestVersion = tag;
                    break;
                }
                else if (Number(tag[0]) === Number(currentVersion[0]) &&
                    Number(tag[1]) === Number(currentVersion[1]) &&
                    Number(tag[2]) > Number(currentVersion[2])) {
                    canUpdate = true;
                    latestVersion = tag;
                    break;
                }
            }
            return {
                currentVersion: currentVersion.join('.'),
                latestVersion: latestVersion.join('.'),
                canUpdate: canUpdate,
                changeLogMessage: '',
            };
        });
    }
    updateCaptain(versionTag, dockerRegistryHelper) {
        const self = this;
        const providedImageName = `${CaptainConstants_1.default.configs.publishedNameOnDockerHub}:${versionTag}`;
        return Promise.resolve()
            .then(function () {
            return dockerRegistryHelper.getDockerAuthObjectForImageName(providedImageName);
        })
            .then(function (authObj) {
            return self.dockerApi.pullImage(providedImageName, authObj);
        })
            .then(function () {
            return self.dockerApi.updateService(CaptainConstants_1.default.captainServiceName, providedImageName, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
        });
    }
    static get() {
        if (!VersionManager.captainManagerInstance) {
            VersionManager.captainManagerInstance = new VersionManager();
        }
        return VersionManager.captainManagerInstance;
    }
}
exports.default = VersionManager;
//# sourceMappingURL=VersionManager.js.map