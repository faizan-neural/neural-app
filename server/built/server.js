#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
console.log('Captain Starting ...');
// Check if Captain is running as an installer or not.
const http = require("http");
const app_1 = require("./app");
const CaptainConstants_1 = require("./utils/CaptainConstants");
const CaptainInstaller = require("./utils/CaptainInstaller");
const EnvVars_1 = require("./utils/EnvVars");
const debugModule = require("debug");
const debug = debugModule('caprover:server');
function startServer() {
    if (CaptainConstants_1.default.isDebug) {
        console.log('***DEBUG BUILD***');
    }
    if (!EnvVars_1.default.IS_CAPTAIN_INSTANCE) {
        console.log('Installing Captain Service ...');
        CaptainInstaller.install();
        return;
    }
    (0, app_1.initializeCaptainWithDelay)();
    /**
     * Get port from environment and store in Express.
     */
    const port = normalizePort(process.env.PORT || '3000');
    app_1.default.set('port', port);
    /**
     * Create HTTP server.
     */
    const server = http.createServer(app_1.default);
    /**
     * Listen on provided port, on all network interfaces.
     */
    server.listen(port);
    server.on('error', onError);
    server.on('listening', onListening);
    /**
     * Normalize a port into a number, string, or false.
     */
    function normalizePort(val) {
        const port = parseInt(val, 10);
        if (isNaN(port)) {
            // named pipe
            return val;
        }
        if (port >= 0) {
            // port number
            return port;
        }
        return false;
    }
    /**
     * Event listener for HTTP server "error" event.
     */
    function onError(error) {
        if (error.syscall !== 'listen') {
            throw error;
        }
        const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;
        // handle specific listen errors with friendly messages
        switch (error.code) {
            case 'EACCES':
                console.error(bind + ' requires elevated privileges');
                process.exit(1);
                break;
            case 'EADDRINUSE':
                console.error(bind + ' is already in use');
                process.exit(1);
                break;
            default:
                throw error;
        }
    }
    /**
     * Event listener for HTTP server "listening" event.
     */
    function onListening() {
        const addr = server.address();
        const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + (addr === null || addr === void 0 ? void 0 : addr.port);
        debug('Listening on ' + bind);
    }
}
startServer();
//# sourceMappingURL=server.js.map