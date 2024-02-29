"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProAlertEvent = exports.ProAlertActionType = void 0;
var ProAlertActionType;
(function (ProAlertActionType) {
    ProAlertActionType["email"] = "email";
    ProAlertActionType["webhook"] = "webhook";
})(ProAlertActionType = exports.ProAlertActionType || (exports.ProAlertActionType = {}));
var ProAlertEvent;
(function (ProAlertEvent) {
    ProAlertEvent["UserLoggedIn"] = "UserLoggedIn";
    ProAlertEvent["AppBuildSuccessful"] = "AppBuildSuccessful";
    ProAlertEvent["AppBuildFailed"] = "AppBuildFailed";
})(ProAlertEvent = exports.ProAlertEvent || (exports.ProAlertEvent = {}));
//# sourceMappingURL=IProFeatures.js.map