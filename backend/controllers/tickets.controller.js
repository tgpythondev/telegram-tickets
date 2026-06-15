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
        const { subject, initialMessage, priority, orderConfig } = req.body;

        // Если есть orderConfig, формируем тему и сообщение из конфигурации
        let finalSubject = subject;
        let finalMessage = initialMessage;

        if (orderConfig) {
            // Формируем тему из пакета
            finalSubject = `Заказ бота: ${orderConfig.package}`;

            // Формируем красивое сообщение из конфигурации
            const packagePrices = {
                'Mini': '$3–5',
                'Mini+': '$5–10',
                'Standard': '$20–30',
                'Max': '$50–70',
                'Custom': 'от $70'
            };

            const hostingText = orderConfig.hosting.type === 'free'
                ? 'Бесплатный (входит в пакет)'
                : orderConfig.hosting.type === 'paid'
                ? `Платный ($5/мес)${orderConfig.hosting.extraStorage > 0 ? ` + ${orderConfig.hosting.extraStorage} ГБ доп. места` : ''}${orderConfig.hosting.extraBandwidth > 0 ? ` + ${orderConfig.hosting.extraBandwidth} ГБ доп. трафика` : ''}`
                : 'Без хостинга (сам разверну)';

            const priorityText = {
                'normal': 'Нормальный (по очереди)',
                'high': 'Высокий (+$10 к стоимости)',
                'urgent': 'Срочный (+$30 к стоимости)'
            };

            finalMessage = `📦 Пакет: ${orderConfig.package} (${packagePrices[orderConfig.package]})

📝 Краткое описание:
${orderConfig.shortDescription}

📋 Подробное описание:
${orderConfig.detailedDescription}

💻 Язык программирования: ${orderConfig.language}

🌐 Хостинг: ${hostingText}

⚡ Приоритет: ${priorityText[orderConfig.priority]}

💰 Итоговая стоимость: $${orderConfig.totalPrice}`;
        }

        if (!finalSubject || !finalMessage) {
            return res.status(400).json({ error: 'Subject and initial message are required' });
        }

        if (finalSubject.length > 200) {
            return res.status(400).json({ error: 'Subject is too long (max 200 characters)' });
        }

        const ticket = await db.createTicket(req.user.id, finalSubject, priority || 'normal', orderConfig || null);
        await db.createMessage(ticket.id, req.user.id, finalMessage, false);

        await sendNewTicketNotification(ticket, req.user.username, finalMessage);

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
