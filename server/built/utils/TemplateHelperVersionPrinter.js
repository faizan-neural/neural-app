"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request");
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const Logger_1 = require("./Logger");
function getTagsForImage(imageBaseName, url, allTags) {
    if (!url) {
        url = `https://hub.docker.com/v2/repositories/${imageBaseName}/tags`;
    }
    return new Promise(function (resolve, reject) {
        request(url, function (error, response, body) {
            if (error || !body) {
                Logger_1.default.e(error);
                reject(error);
                return;
            }
            try {
                // Sometimes Docker server is down and it crashes Captain!
                body = JSON.parse(body);
            }
            catch (e) {
                Logger_1.default.e(e);
            }
            let results;
            if (body) {
                results = body.results;
            }
            if (!results) {
                Logger_1.default.e('NO RESULT');
                reject(new Error('NO RESULT'));
                return;
            }
            if (!allTags) {
                allTags = [];
            }
            for (let idx = 0; idx < results.length; idx++) {
                allTags.push(results[idx].name);
            }
            if (body.next) {
                resolve(getTagsForImage(imageBaseName, body.next, allTags));
                return;
            }
            resolve(allTags);
        });
    });
}
function firstEndsWithSecond(str1, str2) {
    if (!str1 || !str2) {
        throw new Error(`Str1 or Str2 are null ${!str1} ${!str2}`);
    }
    const idx = str1.indexOf(str2);
    return idx >= 0 && idx + str2.length === str1.length;
}
function isEmpty(obj) {
    for (const key in obj) {
        // eslint-disable-next-line no-prototype-builtins
        if (obj.hasOwnProperty(key)) {
            return false;
        }
    }
    return true;
}
class TemplateHelperVersionPrinter {
    constructor() {
        this.cachedImageTags = {};
    }
    getDockerVersionsForTemplateName(templateObj) {
        const self = this;
        if (isEmpty(this.cachedImageTags)) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Please wait about 30 seconds, then try again.');
        }
        const tags = self.cachedImageTags[templateObj.dockerHubImageName];
        const dockerVersions = [];
        for (let i = 0; i < tags.length; i++) {
            const t = tags[i];
            if (firstEndsWithSecond(t, templateObj.tagSuffix)) {
                dockerVersions.push(t.substring(0, t.length - templateObj.tagSuffix.length));
            }
        }
        return dockerVersions;
    }
    printAvailableImageTagsForReadme(templates) {
        const self = this;
        self.cachedImageTags = {};
        const tempCache = {};
        for (let i = 0; i < templates.length; i++) {
            const currentImageName = templates[i].dockerHubImageName;
            getTagsForImage(currentImageName, undefined, undefined)
                .then(function (tags) {
                tempCache[currentImageName] = tags;
                let isAllDone = true;
                for (let j = 0; j < templates.length; j++) {
                    const imageName = templates[j].dockerHubImageName;
                    if (!tempCache[imageName]) {
                        isAllDone = false;
                    }
                }
                if (isAllDone) {
                    Logger_1.default.d('Template Cache Updated!');
                    self.cachedImageTags = tempCache;
                    // Used for README
                    for (let tempIdx = 0; tempIdx < templates.length; tempIdx++) {
                        Logger_1.default.d(' ');
                        Logger_1.default.d(templates[tempIdx].templateName + '/');
                        Logger_1.default.d(self
                            .getDockerVersionsForTemplateName(templates[tempIdx])
                            .join(', '));
                        Logger_1.default.d(' ');
                    }
                }
            })
                .catch(function (error) {
                Logger_1.default.e(error);
            });
        }
    }
}
exports.default = TemplateHelperVersionPrinter;
//# sourceMappingURL=TemplateHelperVersionPrinter.js.map