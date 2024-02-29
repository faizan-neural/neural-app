"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapRoverEventFactory = exports.CapRoverEventType = void 0;
var CapRoverEventType;
(function (CapRoverEventType) {
    CapRoverEventType["UserLoggedIn"] = "UserLoggedIn";
    CapRoverEventType["AppBuildSuccessful"] = "AppBuildSuccessful";
    CapRoverEventType["AppBuildFailed"] = "AppBuildFailed";
    CapRoverEventType["InstanceStarted"] = "InstanceStarted";
    CapRoverEventType["OneClickAppDetailsFetched"] = "OneClickAppDetailsFetched";
    CapRoverEventType["OneClickAppListFetched"] = "OneClickAppListFetched";
})(CapRoverEventType = exports.CapRoverEventType || (exports.CapRoverEventType = {}));
class CapRoverEventFactory {
    static create(eventType, eventMetadata) {
        return {
            eventType,
            eventMetadata,
        };
    }
}
exports.CapRoverEventFactory = CapRoverEventFactory;
//# sourceMappingURL=ICapRoverEvent.js.map