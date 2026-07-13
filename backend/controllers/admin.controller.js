const db = require('../models/db');
const sse = require('../utils/sse');
const { finalizePromoOnClose } = require('./tickets.controller');

// Получить все тикеты (для админов)
async function listAllTickets(req, res) {
    console.log('[LIST TICKETS] Starting - User:', req.user.username, 'isAdmin:', req.user.isAdmin);
    try {
        const { status, assigned_to_me } = req.query;
        console.log('[LIST TICKETS] Filters:', { status, assigned_to_me });

        const filters = {};
        if (status) {
            const validStatuses = ['open', 'in_progress', 'closed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Invalid status. Must be: open, in_progress, or closed' });
            }
            filters.status = status;
        }
        if (assigned_to_me === 'true') {
            filters.assignedToMe = req.user.id;
        }

        const tickets = await db.findAllTickets(filters);
        console.log('[LIST TICKETS] Found', tickets.length, 'tickets');

        res.json({ tickets });
    } catch (error) {
        console.error('[LIST TICKETS] Error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Обновить тикет (для админов)
async function updateTicket(req, res) {
    console.log('[UPDATE TICKET] Starting - User:', req.user.username);
    try {
        const { id } = req.params;
        const { status, priority, assignedAdminId } = req.body;
        console.log('[UPDATE TICKET] ID:', id, 'Updates:', { status, priority, assignedAdminId });

        const ticket = await db.findTicketById(id);
        console.log('[UPDATE TICKET] Ticket found:', ticket ? ticket.id : 'NOT FOUND');

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const updates = {};

        if (status !== undefined) {
            // Валидация статуса
            const validStatuses = ['open', 'in_progress', 'closed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Invalid status. Must be: open, in_progress, or closed' });
            }
            updates.status = status;
        }

        if (priority !== undefined) {
            // Валидация приоритета
            const validPriorities = ['normal', 'high', 'urgent'];
            if (!validPriorities.includes(priority)) {
                return res.status(400).json({ error: 'Invalid priority. Must be: normal, high, or urgent' });
            }
            updates.priority = priority;
        }

        if (assignedAdminId !== undefined) {
            // Валидация assignedAdminId
            if (assignedAdminId !== null) {
                const admin = await db.findUserById(assignedAdminId);
                if (!admin || !admin.is_admin) {
                    return res.status(400).json({ error: 'Invalid admin ID or user is not an admin' });
                }
            }
            updates.assignedAdminId = assignedAdminId;
        }

        // Проверка, что есть что обновлять
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const updatedTicket = await db.updateTicket(id, updates);

        // ── Finalize promo use when admin closes a ticket ────────────────────
        if (updates.status === 'closed' && ticket.status !== 'closed') {
            await finalizePromoOnClose(id, ticket.user_id);
        }

        // Отправить SSE события
        sse.send('admins', 'admin:ticket:updated', updatedTicket);
        if (sse.isUserConnected(updatedTicket.user_id)) {
            sse.sendToUser(updatedTicket.user_id, 'user:ticket:updated', {
                ticketId: updatedTicket.id,
                status: updatedTicket.status,
                priority: updatedTicket.priority,
                assignedAdminUsername: updatedTicket.assigned_admin_username
            });
        } else {
            console.warn(`SSE: User ${updatedTicket.user_id} not connected, will see update on page reload`);
        }

        if (updates.assignedAdminId && updates.assignedAdminId !== ticket.assigned_admin_id) {

            // Создать системное сообщение в тикете о назначении админа
            await db.createMessage(
                updatedTicket.id,
                req.user.id,
                `Администратор ${req.user.username} взял ваш тикет в работу`,
                true
            );

            // Отправить SSE событие о новом системном сообщении
            if (sse.isUserConnected(updatedTicket.user_id)) {
                sse.sendToUser(updatedTicket.user_id, 'user:message:new', {
                    ticketId: updatedTicket.id,
                    message: {
                        content: `Администратор ${req.user.username} взял ваш тикет в работу`,
                        username: 'Система',
                        is_admin_reply: true,
                        created_at: new Date().toISOString()
                    }
                });
            }
        }

        res.json({ ticket: updatedTicket });
    } catch (error) {
        console.error('Update ticket error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Ответить на тикет (для админов)
async function replyToTicket(req, res) {
    console.log('[REPLY] Starting replyToTicket');
    console.log('[REPLY] Request params:', req.params);
    console.log('[REPLY] Request body:', req.body);
    console.log('[REPLY] User ID:', req.user.id, 'Username:', req.user.username);

    try {
        const { id } = req.params;
        const { content } = req.body;

        console.log('[REPLY] Ticket ID from params:', id);

        if (!content || content.trim().length === 0) {
            console.log('[REPLY] Empty content rejected');
            return res.status(400).json({ error: 'Reply content is required' });
        }

        // Validate max length (same as frontend enforces)
        if (content.length > 5000) {
            return res.status(400).json({ error: 'Reply is too long (max 5000 characters)' });
        }

        console.log('[REPLY] Finding ticket...');
        const ticket = await db.findTicketById(id);

        if (!ticket) {
            console.log('[REPLY] Ticket not found:', id);
            return res.status(404).json({ error: 'Ticket not found' });
        }

        console.log('[REPLY] Ticket found:', ticket.id, 'User ID:', ticket.user_id);

        const message = await db.createMessage(ticket.id, req.user.id, content, true);
        console.log('[REPLY] Message created:', message.id);

        // Отправить SSE события админам
        console.log('[REPLY] Sending to admins...');
        sse.send('admins', 'admin:message:new', {
            ticketId: ticket.id,
            message: {
                ...message,
                username: req.user.username
            }
        });

        // Проверить подключение пользователя перед отправкой
        console.log(`[REPLY] Checking connection for user ${ticket.user_id} (type: ${typeof ticket.user_id})`);
        if (sse.isUserConnected(ticket.user_id)) {
            console.log(`[REPLY] User ${ticket.user_id} is connected, sending message`);
            sse.sendToUser(ticket.user_id, 'user:message:new', {
                ticketId: ticket.id,
                message: {
                    ...message,
                    username: req.user.username
                }
            });
        } else {
            console.warn(`[REPLY] User ${ticket.user_id} not connected, message will be visible on next page load`);
            console.warn(`[REPLY] Active users:`, sse.getConnectionStats());
        }

        res.status(201).json({ message });
        console.log('[REPLY] Response sent successfully');
    } catch (error) {
        console.error('[REPLY] Error:', error.message);
        console.error('[REPLY] Stack:', error.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Получить статистику (для админов)
async function getStats(req, res) {
    try {
        const stats = await db.getAdminStats();

        res.json({ stats });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    listAllTickets,
    updateTicket,
    replyToTicket,
    getStats
};
