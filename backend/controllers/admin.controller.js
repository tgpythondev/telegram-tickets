const db = require('../models/db');
const sse = require('../utils/sse');
const { finalizePromoOnClose } = require('./tickets.controller');

// Получить все тикеты (для админов)
async function listAllTickets(req, res) {
    try {
        const { status, assigned_to_me } = req.query;

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
        res.json({ tickets });
    } catch (error) {
        console.error('List tickets error:', error.message);
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
            const validStatuses = ['open', 'in_progress', 'closed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Invalid status. Must be: open, in_progress, or closed' });
            }
            updates.status = status;
        }

        if (priority !== undefined) {
            const validPriorities = ['normal', 'high', 'urgent'];
            if (!validPriorities.includes(priority)) {
                return res.status(400).json({ error: 'Invalid priority. Must be: normal, high, or urgent' });
            }
            updates.priority = priority;
        }

        if (assignedAdminId !== undefined) {
            if (assignedAdminId !== null) {
                const admin = await db.findUserById(assignedAdminId);
                if (!admin || !admin.is_admin) {
                    return res.status(400).json({ error: 'Invalid admin ID or user is not an admin' });
                }
            }
            updates.assignedAdminId = assignedAdminId;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const updatedTicket = await db.updateTicket(id, updates);

        // Finalize promo use when admin closes a ticket
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
        }

        if (updates.assignedAdminId && updates.assignedAdminId !== ticket.assigned_admin_id) {
            await db.createMessage(
                updatedTicket.id,
                req.user.id,
                `Администратор ${req.user.username} взял ваш тикет в работу`,
                true
            );

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
    try {
        const { id } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Reply content is required' });
        }

        if (content.length > 5000) {
            return res.status(400).json({ error: 'Reply is too long (max 5000 characters)' });
        }

        const ticket = await db.findTicketById(id);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const message = await db.createMessage(ticket.id, req.user.id, content, true);

        sse.send('admins', 'admin:message:new', {
            ticketId: ticket.id,
            message: { ...message, username: req.user.username }
        });

        if (sse.isUserConnected(ticket.user_id)) {
            sse.sendToUser(ticket.user_id, 'user:message:new', {
                ticketId: ticket.id,
                message: { ...message, username: req.user.username }
            });
        }

        res.status(201).json({ message });
    } catch (error) {
        console.error('Reply to ticket error:', error.message);
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
