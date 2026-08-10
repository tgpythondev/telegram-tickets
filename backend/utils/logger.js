/**
 * Lightweight async-friendly logger.
 *
 * In production pino is used (fast, JSON, non-blocking).
 * If pino is not yet installed the module falls back to a minimal
 * wrapper that keeps the same API but uses console methods — safe
 * to replace with `npm install pino pino-http` at any time.
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('server started');
 *   logger.warn({ userId }, 'no SSE connection');
 *   logger.error({ err }, 'database failure');
 */

'use strict';

let pino;
try {
    pino = require('pino');
} catch (_) {
    pino = null;
}

let logger;

if (pino) {
    logger = pino({
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
        // In production write newline-delimited JSON to stdout (non-blocking)
        // In development pretty-print if pino-pretty is available
        transport: process.env.NODE_ENV !== 'production'
            ? (() => { try { return { target: 'pino-pretty', options: { colorize: true } }; } catch (_) { return undefined; } })()
            : undefined
    });
} else {
    // Fallback: minimal wrapper that mirrors the pino API surface we use
    const IS_PROD = process.env.NODE_ENV === 'production';
    const noop = () => {};
    logger = {
        trace: noop,
        debug: noop,
        // In production suppress info/warn to reduce sync stdout writes
        info:  IS_PROD ? noop : (...a) => console.log(...a),
        warn:  IS_PROD ? noop : (...a) => console.warn(...a),
        error: (...a) => console.error(...a),
        fatal: (...a) => console.error(...a),
        child: function(bindings) {
            // Returns a child logger with the same behaviour
            return Object.assign({}, this, {
                info:  IS_PROD ? noop : (...a) => console.log(JSON.stringify(bindings), ...a),
                warn:  IS_PROD ? noop : (...a) => console.warn(JSON.stringify(bindings), ...a),
                error: (...a) => console.error(JSON.stringify(bindings), ...a),
            });
        }
    };
}

module.exports = logger;
