'use strict';

/**
 * firewallMiddleware.js — Express middleware анти-DDoS защиты.
 *
 * Поток запроса:
 *   1. Проверить IP в бан-листе → если забанен, сразу 429
 *   2. Запустить detectRateLimit + detectBurst → если сработал, забанить и 429
 *   3. После отправки ответа — запустить detectErrorFlood (res.on('finish'))
 *      Если сработал — забанить IP (следующий запрос получит 429)
 *
 * При каждой блокировке:
 *   - Логируется через utils/logger
 *   - Записывается в audit_logs через utils/audit (ddos_block)
 *   - Клиент получает заголовок Retry-After
 */

const store = require('./ipStore');
const { detectRateLimit, detectBurst, detectErrorFlood } = require('./detectors');
const logger = require('../utils/logger');

// audit импортируем лениво, чтобы избежать circular dependency при старте
let audit = null;
function getAudit() {
    if (!audit) audit = require('../utils/audit');
    return audit;
}

/**
 * Отправить ответ 429 и записать в audit.
 * @param {object} req
 * @param {object} res
 * @param {{ ip: string, reason: string, banUntil: Date }} banInfo
 */
function blockRequest(req, res, banInfo) {
    const retryAfterSec = Math.ceil((banInfo.banUntil.getTime() - Date.now()) / 1000);

    logger.warn(
        { ip: banInfo.ip, reason: banInfo.reason, banUntil: banInfo.banUntil },
        '[firewall] IP banned'
    );

    // Асинхронная запись в audit — не ждём, не блокируем ответ
    try {
        const { logAuditEvent, AUDIT_ACTIONS } = getAudit();
        logAuditEvent(null, AUDIT_ACTIONS.DDOS_BLOCK, req, {
            ip: banInfo.ip,
            reason: banInfo.reason,
            banUntil: banInfo.banUntil.toISOString()
        }).catch(() => {}); // silent — не должно роняться
    } catch (_) {
        // audit недоступен — продолжаем без него
    }

    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
        error: 'Too many requests',
        retryAfter: retryAfterSec
    });
}

/**
 * Express middleware фаервола.
 */
function firewallMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';

    // ── 1. Проверка бан-листа ────────────────────────────────────────────────
    const banStatus = store.isBanned(ip);
    if (banStatus.banned) {
        const retryAfterSec = Math.ceil(banStatus.remainingMs / 1000);
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
            error: 'Too many requests',
            retryAfter: retryAfterSec
        });
    }

    // ── 2. Детекторы на входе запроса ────────────────────────────────────────
    const detectors = [
        detectRateLimit(ip, store),
        detectBurst(ip, store)
    ];

    for (const result of detectors) {
        if (result.blocked) {
            const banInfo = store.ban(ip, result.banDurationMs, result.reason);
            return blockRequest(req, res, banInfo);
        }
    }

    // ── 3. Детектор 4xx-флуда — запускается ПОСЛЕ отправки ответа ───────────
    res.on('finish', () => {
        // Если IP уже забанен (мог забаниться параллельным запросом) — пропускаем
        if (store.isBanned(ip).banned) return;

        const result = detectErrorFlood(ip, store, res.statusCode);
        if (result.blocked) {
            const banInfo = store.ban(ip, result.banDurationMs, result.reason);

            logger.warn(
                { ip, reason: result.reason, banUntil: banInfo.banUntil },
                '[firewall] IP banned after 4xx flood (ban will apply to next request)'
            );

            try {
                const { logAuditEvent, AUDIT_ACTIONS } = getAudit();
                logAuditEvent(null, AUDIT_ACTIONS.DDOS_BLOCK, req, {
                    ip,
                    reason: result.reason,
                    banUntil: banInfo.banUntil.toISOString()
                }).catch(() => {});
            } catch (_) {}
        }
    });

    next();
}

module.exports = firewallMiddleware;
