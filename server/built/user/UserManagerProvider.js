"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserManagerProvider = void 0;
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const UserManager_1 = require("./UserManager");
const cache = {};
class UserManagerProvider {
    static get(namespace) {
        namespace = `${namespace || ''}`.trim();
        if (!namespace) {
            throw new Error('NameSpace is empty');
        }
        if (namespace !== CaptainConstants_1.default.rootNameSpace) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Namespace unknown');
        }
        if (!cache[namespace]) {
            cache[namespace] = new UserManager_1.UserManager(namespace);
        }
        return cache[namespace];
    }
}
exports.UserManagerProvider = UserManagerProvider;
//# sourceMappingURL=UserManagerProvider.js.map