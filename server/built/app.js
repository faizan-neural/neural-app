"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeCaptainWithDelay = void 0;
const express = require("express");
var cors = require('cors');
const path = require("path");
const favicon = require("serve-favicon");
const loggerMorgan = require("morgan");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const httpProxyImport = require("http-proxy");
const ApiStatusCodes_1 = require("./api/ApiStatusCodes");
const BaseApi_1 = require("./api/BaseApi");
const InjectionExtractor_1 = require("./injection/InjectionExtractor");
const Injector = require("./injection/Injector");
const DownloadRouter_1 = require("./routes/download/DownloadRouter");
const LoginRouter_1 = require("./routes/login/LoginRouter");
const UserRouter_1 = require("./routes/user/UserRouter");
const CaptainManager_1 = require("./user/system/CaptainManager");
const CaptainConstants_1 = require("./utils/CaptainConstants");
const Logger_1 = require("./utils/Logger");
const Utils_1 = require("./utils/Utils");
// import { NextFunction, Request, Response } from 'express'
const httpProxy = httpProxyImport.createProxyServer({});
const app = express();
app.use(cors());
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');
app.use(favicon(path.join(__dirname, '../public', 'favicon.ico')));
app.use(loggerMorgan('dev', {
    skip: function (req, res) {
        return (req.originalUrl === CaptainConstants_1.default.healthCheckEndPoint ||
            req.originalUrl.startsWith(CaptainConstants_1.default.netDataRelativePath + '/'));
    },
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false,
}));
app.use(cookieParser());
if (CaptainConstants_1.default.isDebug) {
    app.use('*', function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', `${CaptainConstants_1.default.headerNamespace},${CaptainConstants_1.default.headerAuth},Content-Type`);
        if (req.method === 'OPTIONS') {
            res.sendStatus(200);
        }
        else {
            next();
        }
    });
    app.use('/force-exit', function (req, res, next) {
        res.send('Okay... I will exit in a second...');
        setTimeout(function () {
            process.exit(0);
        }, 500);
    });
}
app.use(Injector.injectGlobal());
app.use(function (req, res, next) {
    if (InjectionExtractor_1.default.extractGlobalsFromInjected(res).forceSsl) {
        const isRequestSsl = req.secure || req.get('X-Forwarded-Proto') === 'https';
        if (!isRequestSsl) {
            const newUrl = `https://${req.get('host')}${req.originalUrl}`;
            res.redirect(302, newUrl);
            return;
        }
    }
    next();
});
app.use(express.static(path.join(__dirname, '../dist-frontend')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(CaptainConstants_1.default.healthCheckEndPoint, function (req, res, next) {
    res.send(CaptainManager_1.default.get().getHealthCheckUuid());
});
//  ************  Beginning of reverse proxy 3rd party services  ****************************************
app.use(CaptainConstants_1.default.netDataRelativePath, function (req, res, next) {
    if (req.originalUrl.indexOf(CaptainConstants_1.default.netDataRelativePath + '/') !==
        0) {
        const isRequestSsl = req.secure || req.get('X-Forwarded-Proto') === 'https';
        const newUrl = (isRequestSsl ? 'https://' : 'http://') +
            req.get('host') +
            CaptainConstants_1.default.netDataRelativePath +
            '/';
        res.redirect(302, newUrl);
        return;
    }
    next();
});
app.use(CaptainConstants_1.default.netDataRelativePath, Injector.injectUserUsingCookieDataOnly());
app.use(CaptainConstants_1.default.netDataRelativePath, function (req, res, next) {
    if (!InjectionExtractor_1.default.extractUserFromInjected(res)) {
        Logger_1.default.e('User not logged in for NetData');
        res.sendStatus(500);
    }
    else {
        next();
    }
});
httpProxy.on('error', function (err, req, resOriginal) {
    if (err) {
        Logger_1.default.e(err);
    }
    resOriginal.writeHead(500, {
        'Content-Type': 'text/plain',
    });
    if ((err + '').indexOf('getaddrinfo ENOTFOUND captain-netdata-container') >=
        0) {
        resOriginal.end(`Something went wrong... err:  \n NetData is not running! Are you sure you have started it?`);
    }
    else {
        resOriginal.end(`Something went wrong... err: \n ${err ? err : 'NULL'}`);
    }
});
app.use(CaptainConstants_1.default.netDataRelativePath, function (req, res, next) {
    if (Utils_1.default.isNotGetRequest(req)) {
        res.writeHead(401, {
            'Content-Type': 'text/plain',
        });
        res.send('Demo mode is for viewing only');
        return;
    }
    httpProxy.web(req, res, {
        target: `http://${CaptainConstants_1.default.netDataContainerName}:19999`,
    });
});
//  ************  End of reverse proxy 3rd party services  ****************************************
//  *********************  Beginning of API End Points  *******************************************
const API_PREFIX = '/api/';
app.use(API_PREFIX + ':apiVersionFromRequest/', function (req, res, next) {
    if (req.params.apiVersionFromRequest !== CaptainConstants_1.default.apiVersion) {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, `This captain instance only accepts API ${CaptainConstants_1.default.apiVersion}`));
        return;
    }
    if (!InjectionExtractor_1.default.extractGlobalsFromInjected(res).initialized) {
        const response = new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_CAPTAIN_NOT_INITIALIZED, 'Captain is not ready yet...');
        res.send(response);
        return;
    }
    next();
});
// unsecured end points:
app.use(API_PREFIX + CaptainConstants_1.default.apiVersion + '/login/', LoginRouter_1.default);
app.use(API_PREFIX + CaptainConstants_1.default.apiVersion + '/downloads/', DownloadRouter_1.default);
// secured end points
app.use(API_PREFIX + CaptainConstants_1.default.apiVersion + '/user/', UserRouter_1.default);
//  *********************  End of API End Points  *******************************************
// catch 404 and forward to error handler
app.use(function (req, res, next) {
    res.locals.err = new Error('Not Found');
    res.locals.err.errorStatus = 404;
    next(res.locals.err);
});
// error handler
app.use(function (err, req, res, next) {
    Promise.reject(err).catch(ApiStatusCodes_1.default.createCatcher(res));
});
exports.default = app;
function initializeCaptainWithDelay() {
    // Initializing with delay helps with debugging. Usually, docker didn't see the CAPTAIN service
    // if this was done without a delay
    setTimeout(function () {
        CaptainManager_1.default.get().initialize();
    }, 1500);
}
exports.initializeCaptainWithDelay = initializeCaptainWithDelay;
//# sourceMappingURL=app.js.map