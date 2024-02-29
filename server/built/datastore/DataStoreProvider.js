"use strict";
/**
 * Created by kasra on 27/06/17.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ApiStatusCodes_1 = require("../api/ApiStatusCodes");
const CaptainConstants_1 = require("../utils/CaptainConstants");
const DataStore_1 = require("./DataStore");
const dataStoreCache = {};
exports.default = {
    getDataStore: function (namespace) {
        if (!namespace) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_NOT_AUTHORIZED, 'Empty namespace');
        }
        if (namespace !== CaptainConstants_1.default.rootNameSpace) {
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Namespace unknown');
        }
        if (!dataStoreCache[namespace]) {
            dataStoreCache[namespace] = new DataStore_1.default(namespace);
        }
        return dataStoreCache[namespace];
    },
};
//# sourceMappingURL=DataStoreProvider.js.map