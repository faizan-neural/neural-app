"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = require("../utils/Logger");
const BaseApi_1 = require("./BaseApi");
const CaptainError_1 = require("./CaptainError");
class ApiStatusCodes {
    static createError(code, message) {
        return new CaptainError_1.CaptainError(code, message || 'NONE');
    }
    static createCatcher(res) {
        return function (error) {
            if (!error || error.errorStatus !== 404) {
                Logger_1.default.e(error);
            }
            if (error && error.captainErrorType) {
                res.send(new BaseApi_1.default(error.captainErrorType, error.apiMessage));
                return;
            }
            if (error && error.errorStatus) {
                res.sendStatus(Number(error.errorStatus));
                return;
            }
            res.sendStatus(500);
        };
    }
}
ApiStatusCodes.STATUS_ERROR_GENERIC = 1000;
ApiStatusCodes.STATUS_OK = 100;
ApiStatusCodes.STATUS_OK_DEPLOY_STARTED = 101;
ApiStatusCodes.STATUS_OK_PARTIALLY = 102;
ApiStatusCodes.STATUS_ERROR_CAPTAIN_NOT_INITIALIZED = 1001;
ApiStatusCodes.STATUS_ERROR_USER_NOT_INITIALIZED = 1101;
ApiStatusCodes.STATUS_ERROR_NOT_AUTHORIZED = 1102;
ApiStatusCodes.STATUS_ERROR_ALREADY_EXIST = 1103;
ApiStatusCodes.STATUS_ERROR_BAD_NAME = 1104;
ApiStatusCodes.STATUS_WRONG_PASSWORD = 1105;
ApiStatusCodes.STATUS_AUTH_TOKEN_INVALID = 1106;
ApiStatusCodes.VERIFICATION_FAILED = 1107;
ApiStatusCodes.ILLEGAL_OPERATION = 1108;
ApiStatusCodes.BUILD_ERROR = 1109;
ApiStatusCodes.ILLEGAL_PARAMETER = 1110;
ApiStatusCodes.NOT_FOUND = 1111;
ApiStatusCodes.AUTHENTICATION_FAILED = 1112;
ApiStatusCodes.STATUS_PASSWORD_BACK_OFF = 1113;
ApiStatusCodes.STATUS_ERROR_OTP_REQUIRED = 1114;
ApiStatusCodes.STATUS_ERROR_PRO_API_KEY_INVALIDATED = 1115;
exports.default = ApiStatusCodes;
//# sourceMappingURL=ApiStatusCodes.js.map