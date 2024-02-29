"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("crypto");
const fs_extra_1 = require("fs-extra");
const yaml = require("yaml");
const Logger_1 = require("./Logger");
class Utils {
    static removeHttpHttps(input) {
        input = input.trim();
        input = input.replace(/^(?:http?:\/\/)?/i, '');
        input = input.replace(/^(?:https?:\/\/)?/i, '');
        return input;
    }
    static generateRandomString(byteLength) {
        if (!byteLength) {
            byteLength = 12;
        }
        return crypto.randomBytes(byteLength).toString('hex');
    }
    static isValidIp(ip) {
        return /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
    }
    static mergeObjects(object1, object2) {
        const newObject = object1 || {};
        object2 = object2 || {};
        Object.keys(object2).forEach((k) => {
            if (!newObject[k] ||
                Array.isArray(newObject[k]) ||
                Array.isArray(object2[k])) {
                newObject[k] = object2[k];
            }
            else {
                if (typeof object2[k] === 'object' &&
                    typeof newObject[k] === 'object') {
                    newObject[k] = this.mergeObjects(newObject[k], object2[k]);
                }
                else {
                    newObject[k] = object2[k];
                }
            }
        });
        return newObject;
    }
    static convertYamlOrJsonToObject(raw) {
        raw = raw ? `${raw}`.trim() : '';
        if (!raw.length) {
            return undefined;
        }
        let returnValue = undefined;
        if (raw.startsWith('{') || raw.startsWith('[')) {
            try {
                returnValue = JSON.parse(raw);
            }
            catch (error) {
                Logger_1.default.e(error);
            }
        }
        else {
            try {
                returnValue = yaml.parse(raw);
            }
            catch (error) {
                Logger_1.default.e(error);
            }
        }
        return returnValue;
    }
    static deleteFileQuietly(absFileOrDirPath) {
        return (0, fs_extra_1.remove)(absFileOrDirPath).catch(function (error) {
            // nom nom
        });
    }
    static isNotGetRequest(req) {
        return req.method !== 'GET';
    }
    static getDelayedPromise(time) {
        if (!time)
            return Promise.resolve();
        return new Promise((res, rej) => {
            setTimeout(() => {
                res();
            }, time);
        });
    }
    static getNeverReturningPromise() {
        return new Promise((res, rej) => {
            //
        });
    }
    static filterInPlace(arr, condition) {
        const newArray = arr.filter(condition);
        arr.splice(0, arr.length);
        newArray.forEach((value) => arr.push(value));
    }
    static dropFirstElements(arr, maxLength) {
        arr = arr || [];
        maxLength = Number(maxLength);
        if (arr.length <= maxLength)
            return arr;
        return arr.slice(arr.length - maxLength);
    }
    static runPromises(promises, curr) {
        const currCorrected = curr ? curr : 0;
        if (promises.length > currCorrected) {
            return promises[currCorrected]().then(function () {
                return Utils.runPromises(promises, currCorrected + 1);
            });
        }
        return Promise.resolve();
    }
    static checkCustomDomain(customDomain, appName, rootDomain) {
        const dotRootDomain = `.${rootDomain}`;
        const dotAppDomain = `.${appName}${dotRootDomain}`;
        if (!customDomain || !/^[a-z0-9\-\.]+$/.test(customDomain)) {
            throw 'Domain name is not accepted. Please use alphanumerical domains such as myapp.google123.ca';
        }
        if (customDomain.length > 80) {
            throw 'Domain name is not accepted. Please use alphanumerical domains less than 80 characters in length.';
        }
        if (customDomain.indexOf('..') >= 0) {
            throw 'Domain name is not accepted. You cannot have two consecutive periods ".." inside a domain name. Please use alphanumerical domains such as myapp.google123.ca';
        }
        if (customDomain.indexOf(dotAppDomain) === -1 &&
            customDomain.indexOf(dotRootDomain) >= 0 &&
            customDomain.indexOf(dotRootDomain) + dotRootDomain.length ===
                customDomain.length) {
            throw 'Domain name is not accepted. Custom domain cannot be subdomain of root domain.';
        }
    }
}
exports.default = Utils;
//# sourceMappingURL=Utils.js.map