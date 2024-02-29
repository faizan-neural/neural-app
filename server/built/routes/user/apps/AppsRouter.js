"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AppDataRouter_1 = require("./appdata/AppDataRouter");
const AppDefinitionRouter_1 = require("./appdefinition/AppDefinitionRouter");
const WebhooksRouter_1 = require("./webhooks/WebhooksRouter");
const express = require("express");
const router = express.Router();
router.use('/appDefinitions/', AppDefinitionRouter_1.default);
router.use('/appData/', AppDataRouter_1.default);
// semi-secured end points:
router.use('/webhooks/', WebhooksRouter_1.default);
exports.default = router;
//# sourceMappingURL=AppsRouter.js.map