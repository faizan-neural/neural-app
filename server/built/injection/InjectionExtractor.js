"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class InjectionExtractor {
    static extractUserFromInjected(res) {
        return {
            user: res.locals.user,
        };
    }
    static extractGlobalsFromInjected(res) {
        return {
            initialized: res.locals.initialized,
            namespace: res.locals.namespace,
            forceSsl: res.locals.forceSsl,
            userManagerForLoginOnly: res.locals
                .userManagerForLoginOnly,
        };
    }
    static extractAppAndUserForWebhook(res) {
        return {
            user: res.locals.user,
            appName: res.locals.appName,
            app: res.locals.app,
        };
    }
    static extractFileNameForDownload(res) {
        return {
            downloadFileName: res.locals.downloadFileName,
        };
    }
}
exports.default = InjectionExtractor;
//# sourceMappingURL=InjectionExtractor.js.map