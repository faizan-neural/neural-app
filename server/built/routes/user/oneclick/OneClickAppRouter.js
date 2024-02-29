"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const axios_1 = require("axios");
const ApiStatusCodes_1 = require("../../../api/ApiStatusCodes");
const BaseApi_1 = require("../../../api/BaseApi");
const InjectionExtractor_1 = require("../../../injection/InjectionExtractor");
const ICapRoverEvent_1 = require("../../../user/events/ICapRoverEvent");
const CaptainConstants_1 = require("../../../utils/CaptainConstants");
const Logger_1 = require("../../../utils/Logger");
const router = express.Router();
const DEFAULT_ONE_CLICK_BASE_URL = 'https://oneclickapps.caprover.com';
const VERSION = `v4`;
const HEADERS = {};
HEADERS[CaptainConstants_1.default.headerCapRoverVersion] =
    CaptainConstants_1.default.configs.version;
router.post('/repositories/insert', function (req, res, next) {
    const dataStore = InjectionExtractor_1.default.extractUserFromInjected(res).user.dataStore;
    let apiBaseUrl = `${req.body.repositoryUrl || ''}`;
    if (apiBaseUrl.endsWith('/')) {
        apiBaseUrl = apiBaseUrl.substring(0, apiBaseUrl.length - 1);
    }
    return Promise.resolve() //
        .then(function () {
        return dataStore.getAllOneClickBaseUrls();
    })
        .then(function (urls) {
        if (urls.indexOf(apiBaseUrl) >= 0)
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, `Repository URL already exists: ${apiBaseUrl}`);
        return axios_1.default
            .get(apiBaseUrl + `/${VERSION}/list`)
            .then(function (axiosResponse) {
            return axiosResponse.data.oneClickApps;
        })
            .then(function (apps) {
            if (!apps || !apps.length)
                throw new Error(`No apps were retrieved from ${apiBaseUrl}`);
        })
            .catch((err) => {
            Logger_1.default.e(err);
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `Could not fetch app lists from ${apiBaseUrl}`);
        });
    })
        .then(function () {
        return dataStore.insertOneClickBaseUrl(apiBaseUrl);
    })
        .then(function () {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, `One Click apps repository URL is saved: ${apiBaseUrl}`);
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.post('/repositories/delete', function (req, res, next) {
    const dataStore = InjectionExtractor_1.default.extractUserFromInjected(res).user.dataStore;
    let apiBaseUrl = `${req.body.repositoryUrl || ''}`;
    if (apiBaseUrl.endsWith('/')) {
        apiBaseUrl = apiBaseUrl.substring(0, apiBaseUrl.length - 1);
    }
    return Promise.resolve() //
        .then(function () {
        return dataStore.getAllOneClickBaseUrls();
    })
        .then(function (urls) {
        if (urls.indexOf(apiBaseUrl) < 0)
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, `Repository URL does not exist ${apiBaseUrl}`);
    })
        .then(function () {
        return dataStore.deleteOneClickBaseUrl(apiBaseUrl);
    })
        .then(function () {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, `One Click apps repository URL is deleted ${apiBaseUrl}`);
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/repositories/', function (req, res, next) {
    const dataStore = InjectionExtractor_1.default.extractUserFromInjected(res).user.dataStore;
    return Promise.resolve() //
        .then(function () {
        return dataStore.getAllOneClickBaseUrls();
    })
        .then(function (urls) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'One click repositories are retrieved ');
        baseApi.data = {};
        baseApi.data.urls = urls;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/template/list', function (req, res, next) {
    const dataStore = InjectionExtractor_1.default.extractUserFromInjected(res).user.dataStore;
    const eventLogger = InjectionExtractor_1.default.extractUserFromInjected(res).user.userManager
        .eventLogger;
    return Promise.resolve() //
        .then(function () {
        return dataStore.getAllOneClickBaseUrls();
    })
        .then(function (urls) {
        urls.push(DEFAULT_ONE_CLICK_BASE_URL);
        const promises = [];
        eventLogger.trackEvent(ICapRoverEvent_1.CapRoverEventFactory.create(ICapRoverEvent_1.CapRoverEventType.OneClickAppListFetched, {
            numberOfRepos: urls.length,
        }));
        urls.forEach((apiBaseUrl) => {
            const p = (0, axios_1.default)({
                method: 'get',
                url: apiBaseUrl + `/${VERSION}/list`,
                headers: HEADERS,
            })
                .then(function (axiosResponse) {
                return axiosResponse.data.oneClickApps;
            })
                .then(function (apps) {
                return apps.map((element) => {
                    const ret = {
                        baseUrl: apiBaseUrl,
                        name: element.name,
                        displayName: `${element.displayName}`,
                        isOfficial: (element.isOfficial + '').toLowerCase() ===
                            'true',
                        description: `${element.description}`,
                        logoUrl: element.logoUrl &&
                            (element.logoUrl.startsWith('http://') ||
                                element.logoUrl.startsWith('https://'))
                            ? element.logoUrl
                            : `${apiBaseUrl}/${VERSION}/logos/${element.logoUrl}`,
                    };
                    return ret;
                });
            })
                .catch((err) => {
                Logger_1.default.e(err);
                return [];
            });
            promises.push(p);
        });
        return Promise.all(promises);
    })
        .then(function (arrayOfArrays) {
        const allApps = [];
        arrayOfArrays.map((appsFromBase) => {
            return allApps.push(...appsFromBase);
        });
        return allApps;
    })
        .then(function (allApps) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'All one click apps are retrieved');
        baseApi.data = {};
        baseApi.data.oneClickApps = allApps;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
router.get('/template/app', function (req, res, next) {
    const baseDomain = req.query.baseDomain;
    const appName = req.query.appName;
    const dataStore = InjectionExtractor_1.default.extractUserFromInjected(res).user.dataStore;
    const eventLogger = InjectionExtractor_1.default.extractUserFromInjected(res).user.userManager
        .eventLogger;
    return Promise.resolve() //
        .then(function () {
        return dataStore.getAllOneClickBaseUrls();
    })
        .then(function (urls) {
        urls.push(DEFAULT_ONE_CLICK_BASE_URL);
        if (urls.indexOf(baseDomain) < 0)
            throw ApiStatusCodes_1.default.createError(ApiStatusCodes_1.default.ILLEGAL_PARAMETER, 'Unknown base URL ');
        const appUrl = `${baseDomain}/${VERSION}/apps/${appName}`;
        Logger_1.default.d(`retrieving app at: ${appUrl}`);
        // Only log the official repo events
        if (baseDomain === DEFAULT_ONE_CLICK_BASE_URL) {
            eventLogger.trackEvent(ICapRoverEvent_1.CapRoverEventFactory.create(ICapRoverEvent_1.CapRoverEventType.OneClickAppDetailsFetched, {
                appName,
            }));
        }
        return (0, axios_1.default)({
            method: 'get',
            url: appUrl,
            headers: HEADERS,
        }).then(function (responseObject) {
            return responseObject.data;
        });
    })
        .then(function (appTemplate) {
        const baseApi = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'App template is retrieved');
        baseApi.data = {};
        baseApi.data.appTemplate = appTemplate;
        res.send(baseApi);
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
exports.default = router;
//# sourceMappingURL=OneClickAppRouter.js.map