"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CaptainError = void 0;
class CaptainError extends Error {
    constructor(code, msg) {
        super(msg);
        this.captainErrorType = code;
        this.apiMessage = msg;
    }
}
exports.CaptainError = CaptainError;
//# sourceMappingURL=CaptainError.js.map