'use strict';

/**
 * firewall/index.js — точка входа модуля анти-DDoS защиты.
 *
 * Экспортирует готовый Express middleware.
 * Запускает таймер автоматической очистки устаревших записей (раз в 60 сек).
 *
 * Использование в server.js:
 *   const firewall = require('./firewall');
 *   app.use(firewall);
 */

const firewallMiddleware = require('./firewallMiddleware');
const store = require('./ipStore');
const logger = require('../utils/logger');

// Автоочистка бан-листа и счётчиков каждые 60 секунд
const CLEANUP_INTERVAL_MS = 60 * 1000;

const cleanupTimer = setInterval(() => {
    const result = store.cleanup();
    if (result.bansRemoved > 0 || result.countersRemoved > 0) {
        logger.info(
            { bansRemoved: result.bansRemoved, countersRemoved: result.countersRemoved },
            '[firewall] cleanup done'
        );
    }
}, CLEANUP_INTERVAL_MS);

// Не держим процесс живым только ради таймера
cleanupTimer.unref();

module.exports = firewallMiddleware;
