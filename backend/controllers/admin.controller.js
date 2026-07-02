const db = require('../models/db');
const { sendAdminReplyNotification, sendTicketStatusChangeNotification, sendTicketAssignedNotification } = require('../utils/telegram');
const sse = require('../utils/sse');

// Получить все тикеты (для админов)
async function listAllTickets(req, res) {
    try {
        const { status, assigned_to_me } = req.query;

        const filters = {};
        if (status) {
            filters.status = status;
        }
        if (assigned_to_me === 'true') {
            filters.assignedToMe = req.user.id;
        }

        const tickets = await db.findAllTickets(filters);

        res.json({ tickets });
    } catch (error) {
        console.error('List all tickets error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Обновить тикет (для админов)
async function updateTicket(req, res) {
    try {
        const { id } = req.params;
        const { status, priority, assignedAdminId } = req.body;

        const ticket = await db.findTicketById(id);

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
            if (!Number.isInteger(assignedAdminId)) {
                return res.status(400).json({ error: 'Invalid admin ID' });
            }
            // Проверяем, что админ существует
            const adminUser = await db.findUserById(assignedAdminId);
            if (!adminUser || !adminUser.is_admin) {
                return res.status(400).json({ error: 'Invalid admin user' });
            }
            updates.assignedAdminId = assignedAdminId;
        }

        // Проверка, что есть что обновлять
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const updatedTicket = await db.updateTicket(id, updates);

        // Отправить SSE события всем админам
        sse.broadcastToAdmins('admin:ticket:updated', updatedTicket);

        // Отправить пользователю если подключен
        if (sse.isUserConnected(updatedTicket.user_id)) {
            console.log(`SSE: Sending user:ticket:updated to user ${updatedTicket.user_id}`);
            sse.sendToUser(updatedTicket.user_id, 'user:ticket:updated', {
                ticketId: updatedTicket.id,
                status: updatedTicket.status,
                priority: updatedTicket.priority,
                assignedAdminUsername: updatedTicket.assigned_admin_username
            });
        } else {
            console.warn(`SSE: User ${updatedTicket.user_id} not connected, will see update on page reload`);
        }

        // Отправить уведомления пользователю
        if (updates.status && updates.status !== ticket.status) {
            await sendTicketStatusChangeNotification(updatedTicket, ticket.status, updates.status, req.user.username);
        }

        if (updates.assignedAdminId && updates.assignedAdminId !== ticket.assigned_admin_id) {
            await sendTicketAssignedNotification(updatedTicket, req.user.username);

            // Создать системное сообщение в тикете о назначении админа
            await db.createMessage(
                updatedTicket.id,
                req.user.id,
                `Администратор ${req.user.username} взял ваш тикет в работу`,
                true
            );

            // Отправить SSE событие о новом системном сообщении
            if (sse.isUserConnected(updatedTicket.user_id)) {
                console.log(`SSE: Sending user:message:new to user ${updatedTicket.user_id} (admin assignment)`);
                sse.sendToUser(updatedTicket.user_id, 'user:message:new', {
                    ticketId: updatedTicket.id,
                    message: {
                        content: `Администратор ${req.user.username} взял ваш тикет в работу`,
                        username: 'Система',
                        is_admin_reply: true,
                        created_at: new Date().toISOString()
                    }
                });
            } else {
                console.warn(`SSE: User ${updatedTicket.user_id} not connected for admin assignment`);
            }
        }

        res.json({ ticket: updatedTicket });
    } catch (error) {
        console.error('Update ticket error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Ответить на тикет (для админов)
async function replyToTicket(req, res) {
    try {
        const { id } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Reply content is required' });
        }

        const ticket = await db.findTicketById(id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const message = await db.createMessage(ticket.id, req.user.id, content, true);

        // Отправить SSE события всем админам
        sse.broadcastToAdmins('admin:message:new', {
            ticketId: ticket.id,
            message: {
                ...message,
                username: req.user.username
            }
        });

        // Отправить пользователю
        console.log(`SSE: Checking connection for user ${ticket.user_id}`);
        if (sse.isUserConnected(ticket.user_id)) {
            console.log(`SSE: Sending user:message:new to user ${ticket.user_id}`);
            sse.sendToUser(ticket.user_id, 'user:message:new', {
                ticketId: ticket.id,
                message: {
                    ...message,
                    username: req.user.username
                }
            });
        } else {
            console.warn(`SSE: User ${ticket.user_id} not connected, message will be visible on next page load`);
        }

        // Отправить уведомление пользователю
        await sendAdminReplyNotification(ticket, req.user.username, content);

        res.status(201).json({ message });
    } catch (error) {
        console.error('Reply to ticket error:', error);
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
