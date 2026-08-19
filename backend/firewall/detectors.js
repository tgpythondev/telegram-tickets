'use strict';

/**
 * detectors.js — логика детекторов DDoS/флуда.
 *
 * Три независимых детектора, каждый принимает (ip, store) и возвращает:
 *   { blocked: true,  reason: string, banDurationMs: number }
 *   { blocked: false }
 *
 * Пороги (дефолтные):
 *   Rate limit  — >200 req за 60 сек  → бан 10 мин
 *   Burst       — >50  req за 5 сек   → бан 2 мин
 *   4xx flood   — >50  ошибок за 60 сек → бан 5 мин
 */

// ── Конфигурация порогов ──────────────────────────────────────────────────────

const RATE_LIMIT = {
    windowMs:      60 * 1000,   // 60 секунд
    maxRequests:   200,
    banDurationMs: 10 * 60 * 1000  // 10 минут
};

const BURST = {
    windowMs:      5 * 1000,   // 5 секунд
    maxRequests:   50,
    banDurationMs: 2 * 60 * 1000  // 2 минуты
};

const ERROR_FLOOD = {
    windowMs:      60 * 1000,   // 60 секунд
    maxErrors:     50,
    banDurationMs: 5 * 60 * 1000  // 5 минут
};

// ── Детекторы ─────────────────────────────────────────────────────────────────

/**
 * Общий rate limit — >200 запросов за 60 сек с одного IP.
 * Инкрементирует reqCount. Сбрасывает окно при истечении.
 *
 * @param {string} ip
 * @param {import('./ipStore')} store
 * @returns {{ blocked: boolean, reason?: string, banDurationMs?: number }}
 */
function detectRateLimit(ip, store) {
    const c = store.getCounters(ip);
    const now = Date.now();

    // Сбрасываем окно если истекло
    if (now - c.reqWindowStart >= RATE_LIMIT.windowMs) {
        c.reqCount = 0;
        c.reqWindowStart = now;
    }

    c.reqCount++;

    if (c.reqCount > RATE_LIMIT.maxRequests) {
        return {
            blocked: true,
            reason: `rate_limit: ${c.reqCount} req in ${RATE_LIMIT.windowMs / 1000}s`,
            banDurationMs: RATE_LIMIT.banDurationMs
        };
    }

    return { blocked: false };
}

/**
 * Burst-детектор — >50 запросов за 5 сек с одного IP.
 * Инкрементирует burstCount. Сбрасывает окно при истечении.
 *
 * @param {string} ip
 * @param {import('./ipStore')} store
 * @returns {{ blocked: boolean, reason?: string, banDurationMs?: number }}
 */
function detectBurst(ip, store) {
    const c = store.getCounters(ip);
    const now = Date.now();

    if (now - c.burstWindowStart >= BURST.windowMs) {
        c.burstCount = 0;
        c.burstWindowStart = now;
    }

    c.burstCount++;

    if (c.burstCount > BURST.maxRequests) {
        return {
            blocked: true,
            reason: `burst: ${c.burstCount} req in ${BURST.windowMs / 1000}s`,
            banDurationMs: BURST.banDurationMs
        };
    }

    return { blocked: false };
}

/**
 * 4xx flood-детектор — >50 ответов с кодом 4xx за 60 сек с одного IP.
 * Вызывается ПОСЛЕ отправки ответа (в res.on('finish')).
 * Инкрементирует errorCount только для 4xx-кодов.
 *
 * @param {string} ip
 * @param {import('./ipStore')} store
 * @param {number} statusCode  HTTP статус ответа
 * @returns {{ blocked: boolean, reason?: string, banDurationMs?: number }}
 */
function detectErrorFlood(ip, store, statusCode) {
    // Считаем только 4xx ошибки (400–499)
    if (statusCode < 400 || statusCode >= 500) {
        return { blocked: false };
    }

    const c = store.getCounters(ip);
    const now = Date.now();

    if (now - c.errorWindowStart >= ERROR_FLOOD.windowMs) {
        c.errorCount = 0;
        c.errorWindowStart = now;
    }

    c.errorCount++;

    if (c.errorCount > ERROR_FLOOD.maxErrors) {
        return {
            blocked: true,
            reason: `error_flood: ${c.errorCount} 4xx errors in ${ERROR_FLOOD.windowMs / 1000}s`,
            banDurationMs: ERROR_FLOOD.banDurationMs
        };
    }

    return { blocked: false };
}

module.exports = { detectRateLimit, detectBurst, detectErrorFlood };
