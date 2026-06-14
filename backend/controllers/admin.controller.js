const db = require('../models/db');

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
            updates.status = status;
        }
        if (priority !== undefined) {
            updates.priority = priority;
        }
        if (assignedAdminId !== undefined) {
            updates.assignedAdminId = assignedAdminId;
        }

        const updatedTicket = await db.updateTicket(id, updates);

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
