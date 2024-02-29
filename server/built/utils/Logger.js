"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const moment = require("moment");
const CaptainConstants_1 = require("./CaptainConstants");
function errorize(error) {
    if (!(error instanceof Error)) {
        return new Error(`Wrapped: ${error ? error : 'NULL'}`);
    }
    return error;
}
function getTime() {
    return `[36m${moment().format('MMMM Do YYYY, h:mm:ss.SSS a    ')}[0m`;
}
class Logger {
    static d(msg) {
        console.log(getTime() + msg + '');
    }
    static w(msg) {
        console.log(getTime() + msg + '');
    }
    static dev(msg) {
        if (CaptainConstants_1.default.isDebug) {
            console.log(`${getTime()}########### ${msg}`);
        }
    }
    static e(msgOrError, message) {
        const err = errorize(msgOrError);
        console.error(`${getTime() + ((message || '') + '\n') + err}
${err.stack}`);
    }
}
exports.default = Logger;
//# sourceMappingURL=Logger.js.map