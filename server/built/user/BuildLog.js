"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Logger_1 = require("../utils/Logger");
class BuildLog {
    constructor(size) {
        this.size = size;
        this.clear();
    }
    onBuildFailed(error) {
        this.log('----------------------');
        this.log('Deploy failed!');
        this.log(error);
        this.isBuildFailed = true;
    }
    clear() {
        this.isBuildFailed = false;
        this.firstLineNumber = -this.size;
        this.lines = [];
        for (let i = 0; i < this.size; i++) {
            this.lines.push('');
        }
    }
    log(msg) {
        msg = (msg || '') + '';
        this.lines.shift();
        this.lines.push(msg);
        this.firstLineNumber++;
        Logger_1.default.dev(msg);
    }
    getLogs() {
        const self = this;
        // if we don't copy the object, "lines" can get changed but firstLineNumber stay as is, causing bug!
        return JSON.parse(JSON.stringify({
            lines: self.lines,
            firstLineNumber: self.firstLineNumber,
        }));
    }
}
exports.default = BuildLog;
//# sourceMappingURL=BuildLog.js.map