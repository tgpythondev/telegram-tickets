const db = require('../config/database');

// ============ PROMO CODES ============

/**
 * Найти промокод по коду (регистронезависимо)
 */
async function findPromoByCode(code) {
    const result = await db.query(
        'SELECT * FROM promo_codes WHERE UPPER(code) = UPPER($1)',
        [code]
    );
    return result.rows[0] || null;
}

/**
 * Проверить, использовал ли пользователь уже этот промокод
 */
async function hasUserUsedPromo(promoCodeId, userId) {
    const result = await db.query(
        'SELECT id FROM promo_uses WHERE promo_code_id = $1 AND user_id = $2',
        [promoCodeId, userId]
    );
    return result.rows.length > 0;
}

/**
 * Создать запись о применении промокода (pending — ticket_id = NULL)
 * Вызывается при создании тикета
 */
async function createPromoUse(promoCodeId, userId, chosenBenefit) {
    const result = await db.query(
        `INSERT INTO promo_uses (promo_code_id, user_id, chosen_benefit)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [promoCodeId, userId, chosenBenefit]
    );
    return result.rows[0];
}

/**
 * Привязать ticket_id к записи promo_use (при закрытии тикета)
 * и увеличить счётчик использований промокода
 */
async function finalizePromoUse(promoCodeId, userId, ticketId) {
    // Обновить запись использования
    await db.query(
        `UPDATE promo_uses
         SET ticket_id = $1
         WHERE promo_code_id = $2 AND user_id = $3`,
        [ticketId, promoCodeId, userId]
    );

    // Увеличить счётчик использований
    await db.query(
        'UPDATE promo_codes SET use_count = use_count + 1 WHERE id = $1',
        [promoCodeId]
    );
}

/**
 * Найти запись использования промокода по ticket_id
 */
async function findPromoUseByTicket(ticketId) {
    const result = await db.query(
        `SELECT pu.*, pc.code, pc.discount_percent, pc.is_free_mini
         FROM promo_uses pu
         JOIN promo_codes pc ON pc.id = pu.promo_code_id
         WHERE pu.ticket_id = $1`,
        [ticketId]
    );
    return result.rows[0] || null;
}

/**
 * Найти pending-использование промокода для пользователя (ticket_id IS NULL)
 * Используется при создании тикета, чтобы найти ожидающую запись
 */
async function findPendingPromoUse(userId) {
    const result = await db.query(
        `SELECT pu.*, pc.code, pc.discount_percent, pc.is_free_mini, pc.id as promo_id
         FROM promo_uses pu
         JOIN promo_codes pc ON pc.id = pu.promo_code_id
         WHERE pu.user_id = $1 AND pu.ticket_id IS NULL
         ORDER BY pu.created_at DESC
         LIMIT 1`,
        [userId]
    );
    return result.rows[0] || null;
}

// ============ ADMIN CRUD ============

/**
 * Создать новый промокод (только для админов)
 */
async function createPromoCode({ code, description, discountPercent, isFreeMini, maxUses, createdBy }) {
    const result = await db.query(
        `INSERT INTO promo_codes (code, description, discount_percent, is_free_mini, max_uses, created_by)
         VALUES (UPPER($1), $2, $3, $4, $5, $6)
         RETURNING *`,
        [code, description || null, discountPercent ?? 10.00, isFreeMini ?? false, maxUses ?? null, createdBy]
    );
    return result.rows[0];
}

/**
 * Получить все промокоды (для админ-панели)
 */
async function listPromoCodes() {
    const result = await db.query(
        `SELECT pc.*, u.username as created_by_username
         FROM promo_codes pc
         LEFT JOIN users u ON u.id = pc.created_by
         ORDER BY pc.created_at DESC`
    );
    return result.rows;
}

/**
 * Найти промокод по ID
 */
async function findPromoById(id) {
    const result = await db.query(
        'SELECT * FROM promo_codes WHERE id = $1',
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Обновить промокод (is_active, description, max_uses)
 */
async function updatePromoCode(id, { isActive, description, maxUses }) {
    const fields = [];
    const params = [];
    let idx = 1;

    if (isActive !== undefined) {
        fields.push(`is_active = $${idx++}`);
        params.push(isActive);
    }
    if (description !== undefined) {
        fields.push(`description = $${idx++}`);
        params.push(description);
    }
    if (maxUses !== undefined) {
        fields.push(`max_uses = $${idx++}`);
        params.push(maxUses);
    }

    if (fields.length === 0) return null;

    params.push(id);
    const result = await db.query(
        `UPDATE promo_codes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
    );
    return result.rows[0] || null;
}

/**
 * Удалить промокод (только если use_count = 0, иначе деактивировать)
 */
async function deletePromoCode(id) {
    const result = await db.query(
        'DELETE FROM promo_codes WHERE id = $1 AND use_count = 0 RETURNING id',
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Получить статистику использований промокода
 */
async function getPromoStats(id) {
    const result = await db.query(
        `SELECT
            pc.*,
            COUNT(pu.id) as total_uses,
            COUNT(pu.ticket_id) as finalized_uses
         FROM promo_codes pc
         LEFT JOIN promo_uses pu ON pu.promo_code_id = pc.id
         WHERE pc.id = $1
         GROUP BY pc.id`,
        [id]
    );
    return result.rows[0] || null;
}

module.exports = {
    findPromoByCode,
    hasUserUsedPromo,
    createPromoUse,
    finalizePromoUse,
    findPromoUseByTicket,
    findPendingPromoUse,
    createPromoCode,
    listPromoCodes,
    findPromoById,
    updatePromoCode,
    deletePromoCode,
    getPromoStats
};
