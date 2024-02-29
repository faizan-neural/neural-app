"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const ApiStatusCodes_1 = require("../../api/ApiStatusCodes");
const Authenticator_1 = require("../../user/Authenticator");
const CaptainConstants_1 = require("../../utils/CaptainConstants");
const Utils_1 = require("../../utils/Utils");
const router = express.Router();
router.get('/', function (req, res, next) {
    const downloadToken = req.query.downloadToken;
    const namespace = req.query.namespace;
    Promise.resolve() //
        .then(function () {
        return Authenticator_1.default.getAuthenticator(namespace).decodeDownloadToken(downloadToken);
    })
        .then(function (obj) {
        const fileFullPath = `${CaptainConstants_1.default.captainDownloadsDirectory}/${namespace}/${obj.downloadFileName}`;
        res.download(fileFullPath, function () {
            Utils_1.default.deleteFileQuietly(fileFullPath);
        });
    })
        .catch(ApiStatusCodes_1.default.createCatcher(res));
});
exports.default = router;
//# sourceMappingURL=DownloadRouter.js.map