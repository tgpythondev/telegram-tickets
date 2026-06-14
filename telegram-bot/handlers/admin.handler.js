const api = require('../services/api.service');
const session = require('../utils/session');
const {
    getAdminMenuKeyboard,
    getAdminTicketsListKeyboard,
    getTicketAdminKeyboard
} = require('../keyboards/admin.keyboards');

// Главное меню админа
async function handleAdminMenu(bot, chatId) {
    const sess = session.getSession(chatId);

    if (!sess || !sess.isAdmin) {
        await bot.sendMessage(chatId, '❌ Доступ запрещен. Требуются права администратора.');
        return;
    }

    await bot.sendMessage(chatId,
        `👨‍💼 *Панель администратора*\n\n` +
        `Пользователь: ${sess.username}\n` +
        `Выберите действие:`,
        {
            parse_mode: 'Markdown',
            reply_markup: getAdminMenuKeyboard()
        }
    );
}

// Список всех тикетов с фильтром
async function handleAdminTickets(bot, chatId, filter = null) {
    const sess = session.getSession(chatId);

    if (!sess || !sess.isAdmin) {
        await bot.sendMessage(chatId, '❌ Доступ запрещен.');
        return;
    }

    const filters = {};
    if (filter && filter !== 'all') {
        if (filter === 'mine') {
            filters.assigned_to_me = true;
        } else {
            filters.status = filter;
        }
    }

    const result = await api.getAllTickets(sess.accessToken, filters);

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
    }

    const tickets = result.data;

    const filterText = {
        'all': 'Все тикеты',
        'open': 'Открытые тикеты',
        'in_progress': 'Тикеты в работе',
        'closed': 'Закрытые тикеты',
        'mine': 'Мои тикеты'
    };

    if (tickets.length === 0) {
        await bot.sendMessage(chatId,
            `📭 ${filterText[filter || 'all']}: не найдено.`,
            { reply_markup: getAdminTicketsListKeyboard(filter) }
        );
        return;
    }

    const statusEmoji = {
        'open': '🟢',
        'in_progress': '🟡',
        'closed': '⚫'
    };

    // Создать кнопки с тикетами
    const buttons = tickets.slice(0, 20).map(ticket => [{
        text: `${statusEmoji[ticket.status]} #${ticket.id} ${ticket.user_username}: ${ticket.subject.substring(0, 30)}...`,
        callback_data: `admin_ticket_view_${ticket.id}`
    }]);

    buttons.push([
        { text: '🟢 Открытые', callback_data: 'admin_tickets_open' },
        { text: '🟡 В работе', callback_data: 'admin_tickets_in_progress' }
    ]);
    buttons.push([{ text: '← Назад в меню', callback_data: 'admin_menu' }]);

    let message = `📋 *${filterText[filter || 'all']}* (${tickets.length})\n\n`;
    if (tickets.length > 20) {
        message += `Показаны первые 20 тикетов.\n\n`;
    }

    await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

// Просмотр тикета (админ)
async function handleViewTicketAdmin(bot, chatId, ticketId) {
    const sess = session.getSession(chatId);

    if (!sess || !sess.isAdmin) {
        await bot.sendMessage(chatId, '❌ Доступ запрещен.');
        return;
    }

    const result = await api.getTicket(sess.accessToken, ticketId);

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
    }

    const { ticket, messages } = result.data;

    const statusEmoji = {
        'open': '🟢 Открыт',
        'in_progress': '🟡 В работе',
        'closed': '⚫ Закрыт'
    };

    let text = `📋 *Тикет #${ticket.id}* (Админ)\n\n`;
    text += `*От:* ${ticket.user_username}\n`;
    text += `*Тема:* ${ticket.subject}\n`;
    text += `*Статус:* ${statusEmoji[ticket.status]}\n`;
    text += `*Приоритет:* ${ticket.priority}\n`;
    text += `*Создан:* ${new Date(ticket.created_at).toLocaleString('ru-RU')}\n`;

    if (ticket.assigned_admin_username) {
        text += `*Назначен:* ${ticket.assigned_admin_username}\n`;
    } else {
        text += `*Назначен:* никому\n`;
    }

    text += `\n📝 *История сообщений:*\n\n`;

    messages.forEach(msg => {
        const date = new Date(msg.created_at).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        const icon = msg.is_admin_reply ? '👨‍💼' : '👤';
        text += `${icon} *${msg.username}* (${date})\n`;
        text += `${msg.content}\n\n`;
    });

    await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: getTicketAdminKeyboard(ticketId, ticket.status)
    });
}

// Ответить на тикет
async function handleReplyStart(bot, chatId, ticketId) {
    const sess = session.getSession(chatId);

    if (!sess || !sess.isAdmin) {
        await bot.sendMessage(chatId, '❌ Доступ запрещен.');
        return;
    }

    session.updateSession(chatId, {
        state: 'waiting_admin_reply',
        tempData: { ticketId }
    });

    await bot.sendMessage(chatId,
        '💬 Введите ваш ответ пользователю:'
    );
}

// Обработка ответа админа
async function handleAdminReply(bot, msg) {
    const chatId = msg.chat.id;
    const sess = session.getSession(chatId);

    if (!sess || sess.state !== 'waiting_admin_reply' || !sess.isAdmin) {
        return;
    }

    const content = msg.text.trim();

    if (content.length < 1) {
        await bot.sendMessage(chatId, '❌ Ответ не может быть пустым.');
        return;
    }

    const ticketId = sess.tempData.ticketId;

    await bot.sendMessage(chatId, '🔄 Отправка ответа...');

    const result = await api.replyToTicket(sess.accessToken, ticketId, content);

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        session.updateSession(chatId, { state: 'idle', tempData: {} });
        return;
    }

    session.updateSession(chatId, { state: 'idle', tempData: {} });

    await bot.sendMessage(chatId, '✅ Ответ отправлен!\n\nПользователь получит уведомление (если включены).');

    // Показать обновленный тикет
    await handleViewTicketAdmin(bot, chatId, ticketId);
}

// Изменить статус тикета
async function handleUpdateStatus(bot, chatId, ticketId, newStatus) {
    const sess = session.getSession(chatId);

    if (!sess || !sess.isAdmin) {
        await bot.sendMessage(chatId, '❌ Доступ запрещен.');
        return;
    }

    const result = await api.updateTicket(sess.accessToken, ticketId, { status: newStatus });

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
    }

    const statusText = {
        'open': '🟢 Открыт',
        'in_progress': '🟡 В работу',
        'closed': '⚫ Закрыт'
    };

    await bot.sendMessage(chatId, `✅ Статус изменен на: ${statusText[newStatus]}`);
    await handleViewTicketAdmin(bot, chatId, ticketId);
}

// Назначить тикет себе
async function handleAssignTicket(bot, chatId, ticketId) {
    const sess = session.getSession(chatId);

    if (!sess || !sess.isAdmin) {
        await bot.sendMessage(chatId, '❌ Доступ запрещен.');
        return;
    }

    const result = await api.updateTicket(sess.accessToken, ticketId, {
        assignedAdminId: sess.userId,
        status: 'in_progress'
    });

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
    }

    await bot.sendMessage(chatId, '✅ Тикет назначен вам и переведен в работу!');
    await handleViewTicketAdmin(bot, chatId, ticketId);
}

// Статистика
async function handleStats(bot, chatId) {
    const sess = session.getSession(chatId);

    if (!sess || !sess.isAdmin) {
        await bot.sendMessage(chatId, '❌ Доступ запрещен.');
        return;
    }

    const result = await api.getStats(sess.accessToken);

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
    }

    const stats = result.data;

    const text = `📊 *Статистика*\n\n` +
        `🟢 Открытых: ${stats.open_tickets}\n` +
        `🟡 В работе: ${stats.in_progress_tickets}\n` +
        `⚫ Закрытых: ${stats.closed_tickets}\n` +
        `📋 Всего: ${stats.total_tickets}`;

    await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: getAdminMenuKeyboard()
    });
}

module.exports = {
    handleAdminMenu,
    handleAdminTickets,
    handleViewTicketAdmin,
    handleReplyStart,
    handleAdminReply,
    handleUpdateStatus,
    handleAssignTicket,
    handleStats
};
