const db = require('../config/database');

// ============ USERS ============

async function createUser(username, passwordHash) {
    const result = await db.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, is_admin, created_at',
        [username, passwordHash]
    );
    return result.rows[0];
}

async function findUserByUsername(username) {
    const result = await db.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
    );
    return result.rows[0];
}

async function findUserById(id) {
    const result = await db.query(
        'SELECT id, username, is_admin, created_at, last_login FROM users WHERE id = $1',
        [id]
    );
    return result.rows[0];
}

async function updateLastLogin(userId) {
    await db.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
    );
}

async function updateUserTelegramChatId(userId, telegramChatId) {
    const result = await db.query(
        'UPDATE users SET telegram_chat_id = $1, telegram_linked_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [telegramChatId, userId]
    );
    return result.rows[0];
}

async function findUserByTelegramChatId(telegramChatId) {
    const result = await db.query(
        'SELECT id, username, is_admin, telegram_chat_id, telegram_notifications_enabled FROM users WHERE telegram_chat_id = $1',
        [telegramChatId]
    );
    return result.rows[0];
}

async function toggleTelegramNotifications(userId, enabled) {
    const result = await db.query(
        'UPDATE users SET telegram_notifications_enabled = $1 WHERE id = $2 RETURNING telegram_notifications_enabled',
        [enabled, userId]
    );
    return result.rows[0];
}

async function unlinkTelegramAccount(userId) {
    await db.query(
        'UPDATE users SET telegram_chat_id = NULL, telegram_notifications_enabled = FALSE, telegram_linked_at = NULL WHERE id = $1',
        [userId]
    );
}

// ============ REFRESH TOKENS ============

async function saveRefreshToken(userId, token, expiresAt) {
    await db.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userId, token, expiresAt]
    );
}

async function findRefreshToken(token) {
    const result = await db.query(
        'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
        [token]
    );
    return result.rows[0];
}

async function deleteRefreshToken(token) {
    await db.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
}

async function deleteUserRefreshTokens(userId) {
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

// ============ TICKETS ============

async function createTicket(userId, subject, priority = 'normal') {
    const result = await db.query(
        'INSERT INTO tickets (user_id, subject, priority) VALUES ($1, $2, $3) RETURNING *',
        [userId, subject, priority]
    );
    return result.rows[0];
}

async function findTicketById(ticketId) {
    const result = await db.query(
        'SELECT t.*, u.username as user_username, a.username as assigned_admin_username FROM tickets t JOIN users u ON t.user_id = u.id LEFT JOIN users a ON t.assigned_admin_id = a.id WHERE t.id = $1',
        [ticketId]
    );
    return result.rows[0];
}

async function findUserTickets(userId, status = null) {
    let query = 'SELECT t.*, u.username as user_username FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.user_id = $1';
    const params = [userId];

    if (status) {
        query += ' AND t.status = $2';
        params.push(status);
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await db.query(query, params);
    return result.rows;
}

async function findAllTickets(filters = {}) {
    let query = `
        SELECT t.*,
               u.username as user_username,
               a.username as assigned_admin_username,
               (SELECT COUNT(*) FROM messages WHERE ticket_id = t.id) as message_count
        FROM tickets t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN users a ON t.assigned_admin_id = a.id
        WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.status) {
        query += ` AND t.status = $${paramIndex}`;
        params.push(filters.status);
        paramIndex++;
    }

    if (filters.assignedToMe) {
        query += ` AND t.assigned_admin_id = $${paramIndex}`;
        params.push(filters.assignedToMe);
        paramIndex++;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await db.query(query, params);
    return result.rows;
}

async function updateTicketStatus(ticketId, status) {
    const closedAt = status === 'closed' ? 'CURRENT_TIMESTAMP' : 'NULL';
    const result = await db.query(
        `UPDATE tickets SET status = $1, closed_at = ${closedAt} WHERE id = $2 RETURNING *`,
        [status, ticketId]
    );
    return result.rows[0];
}

async function updateTicket(ticketId, updates) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
        fields.push(`status = $${paramIndex}`);
        params.push(updates.status);
        paramIndex++;

        if (updates.status === 'closed') {
            fields.push('closed_at = CURRENT_TIMESTAMP');
        }
    }

    if (updates.priority !== undefined) {
        fields.push(`priority = $${paramIndex}`);
        params.push(updates.priority);
        paramIndex++;
    }

    if (updates.assignedAdminId !== undefined) {
        fields.push(`assigned_admin_id = $${paramIndex}`);
        params.push(updates.assignedAdminId);
        paramIndex++;
    }

    if (fields.length === 0) {
        return null;
    }

    params.push(ticketId);
    const query = `UPDATE tickets SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const result = await db.query(query, params);
    return result.rows[0];
}

// ============ MESSAGES ============

async function createMessage(ticketId, userId, content, isAdminReply = false) {
    const result = await db.query(
        'INSERT INTO messages (ticket_id, user_id, content, is_admin_reply) VALUES ($1, $2, $3, $4) RETURNING *',
        [ticketId, userId, content, isAdminReply]
    );
    return result.rows[0];
}

async function findTicketMessages(ticketId) {
    const result = await db.query(
        'SELECT m.*, u.username FROM messages m JOIN users u ON m.user_id = u.id WHERE m.ticket_id = $1 ORDER BY m.created_at ASC',
        [ticketId]
    );
    return result.rows;
}

// ============ STATS ============

async function getAdminStats() {
    const result = await db.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'open') as open_tickets,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tickets,
            COUNT(*) FILTER (WHERE status = 'closed') as closed_tickets,
            COUNT(*) as total_tickets
        FROM tickets
    `);
    return result.rows[0];
}

module.exports = {
    createUser,
    findUserByUsername,
    findUserById,
    updateLastLogin,
    updateUserTelegramChatId,
    findUserByTelegramChatId,
    toggleTelegramNotifications,
    unlinkTelegramAccount,
    saveRefreshToken,
    findRefreshToken,
    deleteRefreshToken,
    deleteUserRefreshTokens,
    createTicket,
    findTicketById,
    findUserTickets,
    findAllTickets,
    updateTicketStatus,
    updateTicket,
    createMessage,
    findTicketMessages,
    getAdminStats
};
