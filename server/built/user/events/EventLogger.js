"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventLoggerFactory = exports.EventLogger = void 0;
const AnalyticsLogger_1 = require("./emitter/AnalyticsLogger");
const ProEmitter_1 = require("./emitter/ProEmitter");
class EventLogger {
    constructor(eventEmitters) {
        this.eventEmitters = eventEmitters;
    }
    trackEvent(event) {
        this.eventEmitters.forEach((ee) => {
            if (ee.isEventApplicable(event)) {
                ee.emitEvent(event);
            }
        });
    }
}
exports.EventLogger = EventLogger;
class EventLoggerFactory {
    constructor(proManger) {
        this.logger = new EventLogger([
            new AnalyticsLogger_1.AnalyticsLogger(proManger),
            new ProEmitter_1.ProEmitter(proManger),
        ]);
    }
    static get(proManger) {
        if (!EventLoggerFactory.instance) {
            EventLoggerFactory.instance = new EventLoggerFactory(proManger);
        }
        return EventLoggerFactory.instance;
    }
    getLogger() {
        return this.logger;
    }
}
exports.EventLoggerFactory = EventLoggerFactory;
//# sourceMappingURL=EventLogger.js.map