"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const bodyParser = require("body-parser");
const ApiStatusCodes_1 = require("../../../../api/ApiStatusCodes");
const BaseApi_1 = require("../../../../api/BaseApi");
const InjectionExtractor_1 = require("../../../../injection/InjectionExtractor");
const Logger_1 = require("../../../../utils/Logger");
const router = express.Router();
const urlencodedParser = bodyParser.urlencoded({
    extended: true,
});
function getPushedBranches(req) {
    const pushedBranches = [];
    // find which branch is pushed
    // Add it in pushedBranches
    const isGithub = req.header('X-GitHub-Event') === 'push';
    const isBitbucket = req.header('X-Event-Key') === 'repo:push' &&
        req.header('X-Request-UUID') &&
        req.header('X-Hook-UUID');
    const isGitlab = req.header('X-Gitlab-Event') === 'Push Hook';
    if (isGithub) {
        const refPayloadByFormEncoded = req.body.payload;
        let bodyJson = req.body;
        if (refPayloadByFormEncoded) {
            bodyJson = JSON.parse(refPayloadByFormEncoded);
        }
        const ref = bodyJson.ref; // "refs/heads/somebranch"
        pushedBranches.push(ref.substring(11, ref.length));
    }
    else if (isBitbucket) {
        for (let i = 0; i < req.body.push.changes.length; i++) {
            pushedBranches.push(req.body.push.changes[i].new.name);
        }
    }
    else if (isGitlab) {
        const ref = req.body.ref; // "refs/heads/somebranch"
        pushedBranches.push(ref.substring(11, ref.length));
    }
    return pushedBranches;
}
router.post('/triggerbuild', urlencodedParser, function (req, res, next) {
    return Promise.resolve()
        .then(function () {
        const extracted = InjectionExtractor_1.default.extractAppAndUserForWebhook(res);
        const { serviceManager, namespace } = extracted.user;
        const { appName, app } = extracted;
        if (!app || !serviceManager || !namespace || !appName) {
            Logger_1.default.e(new Error('Something went wrong during trigger build. Cannot extract app information from the payload.'));
            throw new Error('Error triggering a build');
        }
        // From this point on, we don't want to error out. Just do the build process in the background
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_OK, 'Build webhook has triggered'));
        Promise.resolve()
            .then(function () {
            const repoInfo = app.appPushWebhook.repoInfo;
            // if we didn't detect branches, the POST might have come from another source that we don't
            // explicitly support. Therefore, we just let it go through and triggers a build regardless.
            const pushedBranches = getPushedBranches(req);
            if (pushedBranches.length > 0) {
                let branchIsTracked = false;
                for (let i = 0; i < pushedBranches.length; i++) {
                    if (pushedBranches[i] === repoInfo.branch) {
                        branchIsTracked = true;
                        break;
                    }
                }
                // POST call was triggered due to another branch being pushed. We don't need to trigger the build.
                if (!branchIsTracked) {
                    return;
                }
            }
            return serviceManager.scheduleDeployNewVersion(appName, {
                repoInfoSource: repoInfo,
            });
        })
            .catch(function (error) {
            Logger_1.default.e(error);
        });
    })
        .catch(function (error) {
        res.send(new BaseApi_1.default(ApiStatusCodes_1.default.STATUS_ERROR_GENERIC, 'Error triggering a build'));
    });
});
exports.default = router;
//# sourceMappingURL=WebhooksRouter.js.map