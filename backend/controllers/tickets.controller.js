const db = require('../models/db');
const { sendNewTicketNotification, sendNewMessageNotification } = require('../utils/telegram');

// Получить список тикетов пользователя
async function listUserTickets(req, res) {
    try {
        const { status } = req.query;
        const tickets = await db.findUserTickets(req.user.id, status);

        res.json({ tickets });
    } catch (error) {
        console.error('List tickets error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Получить детали тикета
async function getTicket(req, res) {
    try {
        const { id } = req.params;
        const ticket = await db.findTicketById(id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.user_id !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const messages = await db.findTicketMessages(id);

        res.json({ ticket, messages });
    } catch (error) {
        console.error('Get ticket error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Создать тикет
async function createTicket(req, res) {
    try {
        const { subject, initialMessage, priority } = req.body;

        if (!subject || !initialMessage) {
            return res.status(400).json({ error: 'Subject and initial message are required' });
        }

        if (subject.length > 200) {
            return res.status(400).json({ error: 'Subject is too long (max 200 characters)' });
        }

        const ticket = await db.createTicket(req.user.id, subject, priority || 'normal');
        await db.createMessage(ticket.id, req.user.id, initialMessage, false);

        await sendNewTicketNotification(ticket, req.user.username, initialMessage);

        res.status(201).json({ ticket });
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Добавить сообщение в тикет
async function addMessage(req, res) {
    try {
        const { id } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        const ticket = await db.findTicketById(id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.user_id !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (ticket.status === 'closed') {
            return res.status(400).json({ error: 'Cannot add message to closed ticket' });
        }

        const message = await db.createMessage(ticket.id, req.user.id, content, req.user.isAdmin);

        if (!req.user.isAdmin) {
            await sendNewMessageNotification(ticket.id, req.user.username, content);
        }

        res.status(201).json({ message });
    } catch (error) {
        console.error('Add message error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Обновить статус тикета (только пользователь может закрыть свой тикет)
async function updateStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        if (status !== 'closed') {
            return res.status(400).json({ error: 'Users can only close their tickets' });
        }

        const ticket = await db.findTicketById(id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const updatedTicket = await db.updateTicketStatus(id, status);

        res.json({ ticket: updatedTicket });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    listUserTickets,
    getTicket,
    createTicket,
    addMessage,
    updateStatus
};
