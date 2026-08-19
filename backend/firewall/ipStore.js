'use strict';

/**
 * ipStore — in-memory хранилище бан-листа и счётчиков трафика.
 *
 * banList  : ip → unbanAt (timestamp ms)
 * counters : ip → { reqCount, reqWindowStart,
 *                   burstCount, burstWindowStart,
 *                   errorCount, errorWindowStart }
 *
 * Singleton — один экземпляр на весь процесс.
 */

class IpStore {
    constructor() {
        /** @type {Map<string, number>} ip → unbanAt timestamp */
        this.banList = new Map();

        /** @type {Map<string, object>} ip → counters */
        this.counters = new Map();
    }

    // ── Ban management ────────────────────────────────────────────────────────

    /**
     * Добавить IP в бан.
     * @param {string} ip
     * @param {number} durationMs  Длительность бана в миллисекундах
     * @param {string} reason      Причина (для логов)
     * @returns {{ ip: string, reason: string, banUntil: Date }}
     */
    ban(ip, durationMs, reason) {
        const unbanAt = Date.now() + durationMs;
        this.banList.set(ip, unbanAt);
        // Сбрасываем счётчики — IP начнёт с нуля после разбана
        this.counters.delete(ip);
        return { ip, reason, banUntil: new Date(unbanAt) };
    }

    /**
     * Проверить, заблокирован ли IP.
     * Автоматически удаляет истёкшие записи.
     * @param {string} ip
     * @returns {{ banned: boolean, remainingMs: number }}
     */
    isBanned(ip) {
        const unbanAt = this.banList.get(ip);
        if (unbanAt === undefined) return { banned: false, remainingMs: 0 };

        const remaining = unbanAt - Date.now();
        if (remaining <= 0) {
            this.banList.delete(ip);
            return { banned: false, remainingMs: 0 };
        }
        return { banned: true, remainingMs: remaining };
    }

    // ── Counter management ────────────────────────────────────────────────────

    /**
     * Получить счётчики для IP. Инициализирует новую запись если нет.
     * @param {string} ip
     * @returns {object}
     */
    getCounters(ip) {
        if (!this.counters.has(ip)) {
            const now = Date.now();
            this.counters.set(ip, {
                reqCount: 0,
                reqWindowStart: now,
                burstCount: 0,
                burstWindowStart: now,
                errorCount: 0,
                errorWindowStart: now
            });
        }
        return this.counters.get(ip);
    }

    /**
     * Сбросить счётчики для IP.
     * @param {string} ip
     */
    reset(ip) {
        this.counters.delete(ip);
    }

    // ── Maintenance ───────────────────────────────────────────────────────────

    /**
     * Удалить устаревшие баны и счётчики.
     * Вызывается автоматически по таймеру раз в минуту.
     * @returns {{ bansRemoved: number, countersRemoved: number }}
     */
    cleanup() {
        const now = Date.now();
        let bansRemoved = 0;
        let countersRemoved = 0;

        for (const [ip, unbanAt] of this.banList.entries()) {
            if (now >= unbanAt) {
                this.banList.delete(ip);
                bansRemoved++;
            }
        }

        // Счётчики старше 5 минут без активности — удаляем
        const STALE_MS = 5 * 60 * 1000;
        for (const [ip, c] of this.counters.entries()) {
            const lastActivity = Math.max(
                c.reqWindowStart,
                c.burstWindowStart,
                c.errorWindowStart
            );
            if (now - lastActivity > STALE_MS) {
                this.counters.delete(ip);
                countersRemoved++;
            }
        }

        return { bansRemoved, countersRemoved };
    }

    /**
     * Статистика для отладки / мониторинга.
     * @returns {{ activeBans: number, trackedIps: number }}
     */
    stats() {
        return {
            activeBans: this.banList.size,
            trackedIps: this.counters.size
        };
    }
}

// Singleton
module.exports = new IpStore();
