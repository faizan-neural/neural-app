"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProEmitter = void 0;
const IEventsEmitter_1 = require("../IEventsEmitter");
class ProEmitter extends IEventsEmitter_1.IEventsEmitter {
    constructor(proManager) {
        super();
        this.proManager = proManager;
    }
    isEventApplicable(event) {
        return this.proManager.isEventEnabledForProReporting(event);
    }
    emitEvent(event) {
        const self = this;
        Promise.resolve()
            .then(function () {
            return self.proManager.getState();
        })
            .then(function (state) {
            if (state.isSubscribed) {
                self.proManager.reportEvent(event);
            }
        });
    }
}
exports.ProEmitter = ProEmitter;
//# sourceMappingURL=ProEmitter.js.map