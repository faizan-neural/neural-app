"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DataStoreProvider_1 = require("../datastore/DataStoreProvider");
DataStoreProvider_1.default.getDataStore('captain')
    .getProDataStore()
    .setOtpEnabled(false)
    .catch((err) => console.log(err));
//# sourceMappingURL=disable-otp.js.map