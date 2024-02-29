"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsLogger = void 0;
const EnvVars_1 = require("../../../utils/EnvVars");
const ICapRoverEvent_1 = require("../ICapRoverEvent");
const IEventsEmitter_1 = require("../IEventsEmitter");
class AnalyticsLogger extends IEventsEmitter_1.IEventsEmitter {
    constructor(proManager) {
        super();
        this.proManager = proManager;
    }
    isEventApplicable(event) {
        if (EnvVars_1.default.CAPROVER_DISABLE_ANALYTICS) {
            return false;
        }
        // some events aren't appropriate for usage stats
        switch (event.eventType) {
            case ICapRoverEvent_1.CapRoverEventType.AppBuildFailed:
            case ICapRoverEvent_1.CapRoverEventType.AppBuildSuccessful:
            case ICapRoverEvent_1.CapRoverEventType.UserLoggedIn: // perhaps anonymize the IP address and send it in the future
                return false;
            case ICapRoverEvent_1.CapRoverEventType.InstanceStarted:
            case ICapRoverEvent_1.CapRoverEventType.OneClickAppDetailsFetched:
            case ICapRoverEvent_1.CapRoverEventType.OneClickAppListFetched:
                return true;
        }
    }
    emitEvent(event) {
        this.proManager.reportUnAuthAnalyticsEvent(event);
    }
}
exports.AnalyticsLogger = AnalyticsLogger;
//# sourceMappingURL=AnalyticsLogger.js.map