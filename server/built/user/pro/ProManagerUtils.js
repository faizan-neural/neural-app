"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ProManagerUtils {
    static ensureProConfigType(pc) {
        pc = pc || {};
        const proConfig = {
            alerts: [],
        };
        if (pc.alerts && Array.isArray(pc.alerts)) {
            const alerts = pc.alerts;
            alerts.forEach((it) => {
                const event = `${it.event}`.trim();
                if (event) {
                    proConfig.alerts.push({
                        event: event,
                        action: {
                            actionType: `${it.action.actionType}`.trim(),
                            metadata: it.action.metadata,
                        },
                    });
                }
            });
        }
        return proConfig;
    }
}
exports.default = ProManagerUtils;
//# sourceMappingURL=ProManagerUtils.js.map