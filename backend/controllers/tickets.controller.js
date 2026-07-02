const db = require('../models/db');
const { sendNewTicketNotification, sendNewMessageNotification } = require('../utils/telegram');
const sse = require('../utils/sse');

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

        // Валидация priority
        const validPriorities = ['normal', 'high', 'urgent'];
        const ticketPriority = priority || 'normal';
        if (!validPriorities.includes(ticketPriority)) {
            return res.status(400).json({ error: 'Invalid priority. Must be: normal, high, or urgent' });
        }

        // Если есть orderConfig, формируем тему и сообщение из конфигурации
        let finalSubject = subject;
        let finalMessage = initialMessage;

        if (orderConfig) {
            // Валидация orderConfig
            if (typeof orderConfig !== 'object' || orderConfig === null || Array.isArray(orderConfig)) {
                return res.status(400).json({ error: 'Invalid orderConfig format' });
            }

            // Проверка размера JSON
            const configSize = JSON.stringify(orderConfig).length;
            if (configSize > 50000) {
                return res.status(400).json({ error: 'OrderConfig is too large (max 50KB)' });
            }

            // Валидация основных полей orderConfig
            if (orderConfig.package && typeof orderConfig.package !== 'string') {
                return res.status(400).json({ error: 'Invalid orderConfig.package' });
            }

            if (orderConfig.language && typeof orderConfig.language !== 'string') {
                return res.status(400).json({ error: 'Invalid orderConfig.language' });
            }

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

            const hostingText = orderConfig.hosting?.type === 'free'
                ? 'Бесплатный (входит в пакет)'
                : orderConfig.hosting?.type === 'paid'
                ? `Платный ($5/мес)${orderConfig.hosting.extraStorage > 0 ? ` + ${orderConfig.hosting.extraStorage} ГБ доп. места` : ''}${orderConfig.hosting.extraBandwidth > 0 ? ` + ${orderConfig.hosting.extraBandwidth} ГБ доп. трафика` : ''}`
                : 'Без хостинга (сам разверну)';

            const priorityText = {
                'normal': 'Нормальный (по очереди)',
                'high': 'Высокий (+$10 к стоимости)',
                'urgent': 'Срочный (+$30 к стоимости)'
            };

            finalMessage = `📦 Пакет: ${orderConfig.package} (${packagePrices[orderConfig.package] || 'custom'})

📝 Краткое описание:
${orderConfig.shortDescription || 'Не указано'}

📋 Подробное описание:
${orderConfig.detailedDescription || 'Не указано'}

💻 Язык программирования: ${orderConfig.language || 'Не указан'}

🌐 Хостинг: ${hostingText}

⚡ Приоритет: ${priorityText[orderConfig.priority] || 'Нормальный'}

💰 Итоговая стоимость: $${orderConfig.totalPrice || 0}`;
        }

        if (!finalSubject || !finalMessage) {
            return res.status(400).json({ error: 'Subject and initial message are required' });
        }

        // Валидация длины
        if (finalSubject.trim().length === 0) {
            return res.status(400).json({ error: 'Subject cannot be empty' });
        }

        if (finalSubject.length > 200) {
            return res.status(400).json({ error: 'Subject is too long (max 200 characters)' });
        }

        if (finalMessage.length > 5000) {
            return res.status(400).json({ error: 'Message is too long (max 5000 characters)' });
        }

        const ticket = await db.createTicket(req.user.id, finalSubject, ticketPriority, orderConfig || null);
        await db.createMessage(ticket.id, req.user.id, finalMessage, false);

        // Отправить SSE событие админам
        sse.send('admins', 'admin:ticket:new', {
            ...ticket,
            user_username: req.user.username
        });

        await sendNewTicketNotification(ticket, req.user.username, finalMessage);

        res.status(201).json({ ticket });
    } catch (error) {
        console.error('Create ticket error:', error.message);
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

        // Валидация длины сообщения
        if (content.length > 5000) {
            return res.status(400).json({ error: 'Message is too long (max 5000 characters)' });
        }

        const ticket = await db.findTicketById(id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        if (ticket.user_id !== req.user.id && !req.user.isAdmin) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (ticket.status === 'closed') {
            return res.status(409).json({ error: 'Cannot add message to closed ticket' });
        }

        const message = await db.createMessage(ticket.id, req.user.id, content.trim(), req.user.isAdmin);

        // Отправить SSE события
        // Админам - если пользователь отправил сообщение
        if (!req.user.isAdmin) {
            sse.send('admins', 'admin:message:new', {
                ticketId: ticket.id,
                message: {
                    ...message,
                    username: req.user.username
                }
            });

            // Отправить пользователю подтверждение
            sse.sendToUser(ticket.user_id, 'user:message:new', {
                ticketId: ticket.id,
                message: {
                    ...message,
                    username: req.user.username
                }
            });
        }

        // Админу-исполнителю - если тикет закреплен за конкретным админом
        if (ticket.assigned_admin_id && req.user.isAdmin) {
            sse.sendToAdmin(ticket.assigned_admin_id, 'admin:message:new', {
                ticketId: ticket.id,
                message: {
                    ...message,
                    username: req.user.username
                }
            });
        }

        if (!req.user.isAdmin) {
            await sendNewMessageNotification(ticket.id, req.user.username, content);
        }

        res.status(201).json({ message });
    } catch (error) {
        console.error('Add message error:', error.message);
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
