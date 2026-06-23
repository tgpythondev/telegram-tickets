const db = require('../config/database');

/**
 * Типы действий для аудита
 */
const AUDIT_ACTIONS = {
    LOGIN_SUCCESS: 'login_success',
    LOGIN_FAILED: 'login_failed',
    ACCOUNT_LOCKED: 'account_locked',
    REGISTER: 'register',
    LOGOUT: 'logout',
    PASSWORD_CHANGE: 'password_change',
    TELEGRAM_LINK: 'telegram_link',
    TELEGRAM_UNLINK: 'telegram_unlink',
    TOKEN_REFRESH: 'token_refresh',
    TELEGRAM_NOTIFICATIONS_TOGGLE: 'telegram_notifications_toggle'
};

/**
 * Создание записи в audit log
 * @param {number|null} userId - ID пользователя (может быть null для неудачных попыток входа)
 * @param {string} action - Тип действия из AUDIT_ACTIONS
 * @param {object} req - Express request объект для извлечения IP и user agent
 * @param {object} metadata - Дополнительные данные о событии
 */
async function logAuditEvent(userId, action, req, metadata = {}) {
    try {
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || null;

        await db.query(
            'INSERT INTO audit_logs (user_id, action, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
            [userId, action, ipAddress, userAgent, metadata ? JSON.stringify(metadata) : null]
        );
    } catch (error) {
        // Не бросаем ошибку, чтобы не прерывать основной flow
        console.error('❌ Ошибка записи audit log:', error.message);
    }
}

/**
 * Получить audit logs для пользователя
 * @param {number} userId - ID пользователя
 * @param {number} limit - Количество записей
 */
async function getUserAuditLogs(userId, limit = 50) {
    try {
        const result = await db.query(
            'SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
            [userId, limit]
        );
        return result.rows;
    } catch (error) {
        console.error('❌ Ошибка получения audit logs:', error.message);
        return [];
    }
}

/**
 * Получить последние audit logs (для админов)
 * @param {number} limit - Количество записей
 * @param {string|null} action - Фильтр по типу действия
 */
async function getRecentAuditLogs(limit = 100, action = null) {
    try {
        let query = 'SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id';
        const params = [];

        if (action) {
            query += ' WHERE al.action = $1';
            params.push(action);
        }

        query += ' ORDER BY al.created_at DESC LIMIT $' + (params.length + 1);
        params.push(limit);

        const result = await db.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('❌ Ошибка получения audit logs:', error.message);
        return [];
    }
}

/**
 * Очистка старых audit logs (старше N дней)
 * @param {number} daysToKeep - Количество дней для хранения логов
 */
async function cleanupOldAuditLogs(daysToKeep = 90) {
    try {
        const result = await db.query(
            'DELETE FROM audit_logs WHERE created_at < CURRENT_TIMESTAMP - INTERVAL \'1 day\' * $1',
            [daysToKeep]
        );

        const deletedCount = result.rowCount || 0;

        if (deletedCount > 0) {
            console.log(`🧹 Очищено ${deletedCount} старых audit logs (старше ${daysToKeep} дней)`);
        }

        return deletedCount;
    } catch (error) {
        console.error('❌ Ошибка очистки audit logs:', error.message);
        return 0;
    }
}

module.exports = {
    AUDIT_ACTIONS,
    logAuditEvent,
    getUserAuditLogs,
    getRecentAuditLogs,
    cleanupOldAuditLogs
};
