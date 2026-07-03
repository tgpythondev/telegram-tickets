const api = require('../services/api.service');
const session = require('../utils/session');
const { checkRateLimit } = require('../utils/rateLimit');
const {
    getMainMenuKeyboard,
    getTicketsListKeyboard,
    getTicketKeyboard,
    getCancelKeyboard,
    getPriorityKeyboard
} = require('../keyboards/user.keyboards');

// Функция для форматирования относительного времени
function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'} назад`;

    // Для старых сообщений возвращаем дату
    return new Date(date).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Главное меню
async function handleMenu(bot, chatId) {
    const sess = session.getSession(chatId);

    if (!sess) {
        await bot.sendMessage(chatId, '❌ Сессия истекла. Войдите заново: /start');
        return;
    }

    await bot.sendMessage(chatId,
        `📋 *Главное меню*\n\n` +
        `Пользователь: ${sess.username}\n` +
        `Выберите действие:`,
        {
            parse_mode: 'Markdown',
            reply_markup: getMainMenuKeyboard(sess.notificationsEnabled)
        }
    );
}

// Список тикетов
async function handleListTickets(bot, chatId) {
    const sess = session.getSession(chatId);

    if (!sess) {
        await bot.sendMessage(chatId, '❌ Сессия истекла. Войдите заново: /start');
        return;
    }

    const result = await api.getTickets(sess.accessToken);

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
    }

    const tickets = result.data;

    if (tickets.length === 0) {
        await bot.sendMessage(chatId,
            '📭 У вас пока нет тикетов.\n\nСоздайте первый тикет, чтобы задать вопрос!',
            { reply_markup: getTicketsListKeyboard() }
        );
        return;
    }

    const statusEmoji = {
        'open': '🟢',
        'in_progress': '🟡',
        'closed': '⚫'
    };

    const statusText = {
        'open': 'Открыт',
        'in_progress': 'В работе',
        'closed': 'Закрыт'
    };

    // Создать инлайн клавиатуру с тикетами
    const buttons = tickets.map(ticket => [{
        text: `${statusEmoji[ticket.status]} #${ticket.id} ${ticket.subject.substring(0, 40)}${ticket.subject.length > 40 ? '...' : ''}`,
        callback_data: `ticket_view_${ticket.id}`
    }]);

    buttons.push([{ text: '➕ Создать тикет', callback_data: 'tickets_create' }]);
    buttons.push([{ text: '← Назад в меню', callback_data: 'main_menu' }]);

    let message = `📋 *Ваши тикеты* (${tickets.length}):\n\n`;

    await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

// Просмотр конкретного тикета
async function handleViewTicket(bot, chatId, ticketId) {
    const sess = session.getSession(chatId);

    if (!sess) {
        await bot.sendMessage(chatId, '❌ Сессия истекла. Войдите заново: /start');
        return;
    }

    const result = await api.getTicket(sess.accessToken, ticketId);

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
    }

    const { ticket, messages } = result.data;

    const statusEmoji = {
        'open': '🟢',
        'in_progress': '🟡',
        'closed': '⚫'
    };

    const statusNames = {
        'open': 'Открыт',
        'in_progress': 'В работе',
        'closed': 'Закрыт'
    };

    const priorityEmoji = {
        'normal': '🔵',
        'high': '🟠',
        'urgent': '🔴'
    };

    const priorityNames = {
        'normal': 'Обычный',
        'high': 'Высокий',
        'urgent': 'Срочный'
    };

    const createdDate = new Date(ticket.created_at).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    let text = `╔═══════════════════════════\n`;
    text += `║ 📋 ТИКЕТ #${ticket.id}\n`;
    text += `╠═══════════════════════════\n`;
    text += `║ 📌 Тема: ${ticket.subject}\n`;
    text += `║ ${statusEmoji[ticket.status]} Статус: ${statusNames[ticket.status]}\n`;
    text += `║ ${priorityEmoji[ticket.priority]} Приоритет: ${priorityNames[ticket.priority]}\n`;
    text += `║ ⏰ Создан: ${createdDate}\n`;

    if (ticket.assigned_admin_username) {
        text += `║ 👨‍💼 Администратор: ${ticket.assigned_admin_username}\n`;
    }

    text += `╚═══════════════════════════\n\n`;
    text += `📝 *История сообщений:*\n\n`;

    messages.forEach((msg, index) => {
        const timeStr = formatRelativeTime(msg.created_at);
        const icon = msg.is_admin_reply ? '👨‍💼' : '👤';

        text += `${icon} *${msg.username}* • ${timeStr}\n`;
        text += `${msg.content}\n`;

        if (index < messages.length - 1) {
            text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        }
    });

    await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: getTicketKeyboard(ticketId, ticket.status)
    });
}

// Начать создание тикета
async function handleCreateTicketStart(bot, chatId) {
    const sess = session.getSession(chatId);

    if (!sess) {
        await bot.sendMessage(chatId, '❌ Сессия истекла. Войдите заново: /start');
        return;
    }

    // Проверка rate limit для создания тикетов (1 в минуту)
    const rateCheck = checkRateLimit(chatId, 'ticket');
    if (!rateCheck.allowed) {
        await bot.sendMessage(chatId, `⏳ Слишком много тикетов. Повторите через ${rateCheck.retryAfter} сек.`);
        return;
    }

    session.updateSession(chatId, {
        state: 'waiting_ticket_subject',
        tempData: {}
    });

    await bot.sendMessage(chatId,
        '📝 *Создание тикета*\n\n' +
        'Шаг 1/3: Введите тему тикета (макс. 200 символов)\n\n' +
        'Например: "Вопрос по стоимости бота"',
        {
            parse_mode: 'Markdown',
            reply_markup: getCancelKeyboard()
        }
    );
}

// Обработка темы тикета
async function handleTicketSubject(bot, msg) {
    const chatId = msg.chat.id;
    const sess = session.getSession(chatId);

    if (!sess || sess.state !== 'waiting_ticket_subject') {
        return;
    }

    const subject = msg.text.trim();

    if (subject.length < 3) {
        await bot.sendMessage(chatId, '❌ Тема слишком короткая. Минимум 3 символа.');
        return;
    }

    if (subject.length > 200) {
        await bot.sendMessage(chatId, '❌ Тема слишком длинная. Максимум 200 символов.');
        return;
    }

    session.updateSession(chatId, {
        state: 'waiting_ticket_message',
        tempData: { subject }
    });

    await bot.sendMessage(chatId,
        '✅ Тема сохранена!\n\n' +
        '📝 Шаг 2/3: Опишите вашу проблему или вопрос\n\n' +
        'Постарайтесь описать как можно подробнее.',
        {
            reply_markup: getCancelKeyboard()
        }
    );
}

// Обработка сообщения тикета
async function handleTicketMessage(bot, msg) {
    const chatId = msg.chat.id;
    const sess = session.getSession(chatId);

    if (!sess || sess.state !== 'waiting_ticket_message') {
        return;
    }

    const message = msg.text.trim();

    if (message.length < 10) {
        await bot.sendMessage(chatId, '❌ Сообщение слишком короткое. Минимум 10 символов.');
        return;
    }

    sess.tempData.message = message;
    session.updateSession(chatId, {
        state: 'waiting_ticket_priority',
        tempData: sess.tempData
    });

    await bot.sendMessage(chatId,
        '✅ Описание сохранено!\n\n' +
        '⚠️ Шаг 3/3: Выберите приоритет тикета:',
        {
            reply_markup: getPriorityKeyboard()
        }
    );
}

// Завершение создания тикета
async function handleTicketPriority(bot, chatId, priority, messageId) {
    const sess = session.getSession(chatId);

    if (!sess || sess.state !== 'waiting_ticket_priority') {
        return;
    }

    // Используем edit если messageId передан
    const sendMessage = messageId ? bot.editMessageText : bot.sendMessage;
    const sendParams = messageId ? {
        chat_id: chatId,
        message_id: messageId
    } : { chatId };

    const ticket = await (async () => {
        await sendMessage('🔄 Создание тикета...', { ...sendParams, parse_mode: 'Markdown' });

        const result = await api.createTicket(
            sess.accessToken,
            sess.tempData.subject,
            sess.tempData.message,
            priority
        );

        if (!result.success) {
            await sendMessage(`❌ Ошибка: ${result.error}`, { ...sendParams, parse_mode: 'Markdown' });
            session.updateSession(chatId, { state: 'idle', tempData: {} });
            return null;
        }

        return result.data;
    })();

    if (!ticket) return;

    session.updateSession(chatId, { state: 'idle', tempData: {} });

    await sendMessage(
        `✅ *Тикет успешно создан!*\n\n` +
        `Номер: #${ticket.id}\n` +
        `Тема: ${ticket.subject}\n` +
        `Статус: 🟢 Открыт\n\n` +
        `Администратор ответит в ближайшее время.\n` +
        `Вы получите уведомление, если включите их в настройках.`,
        {
            ...sendParams,
            parse_mode: 'Markdown',
            reply_markup: getMainMenuKeyboard(sess.notificationsEnabled)
        }
    );
}

// Добавить сообщение в тикет
async function handleAddMessage(bot, chatId, ticketId) {
    const sess = session.getSession(chatId);

    if (!sess) {
        await bot.sendMessage(chatId, '❌ Сессия истекла. Войдите заново: /start');
        return;
    }

    session.updateSession(chatId, {
        state: 'waiting_ticket_reply',
        tempData: { ticketId }
    });

    await bot.sendMessage(chatId,
        '💬 Введите ваше сообщение:',
        { reply_markup: getCancelKeyboard() }
    );
}

// Обработка ответа в тикет
async function handleTicketReply(bot, msg) {
    const chatId = msg.chat.id;
    const sess = session.getSession(chatId);

    if (!sess || sess.state !== 'waiting_ticket_reply') {
        return;
    }

    const content = msg.text.trim();

    if (content.length < 1) {
        await bot.sendMessage(chatId, '❌ Сообщение не может быть пустым.');
        return;
    }

    // Проверка rate limit для сообщений (15 сек)
    const rateCheck = checkRateLimit(chatId, 'message');
    if (!rateCheck.allowed) {
        await bot.sendMessage(chatId, `⏳ Слишком много сообщений. Повторите через ${rateCheck.retryAfter} сек.`);
        return;
    }

    const ticketId = sess.tempData.ticketId;

    await bot.sendMessage(chatId, '🔄 Отправка сообщения...');

    const result = await api.addMessage(sess.accessToken, ticketId, content);

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        session.updateSession(chatId, { state: 'idle', tempData: {} });
        return;
    }

    session.updateSession(chatId, { state: 'idle', tempData: {} });

    await bot.sendMessage(chatId, '✅ Сообщение отправлено!');

    // Показать обновленный тикет
    await handleViewTicket(bot, chatId, ticketId);
}

// Закрыть тикет
async function handleCloseTicket(bot, chatId, ticketId) {
    const sess = session.getSession(chatId);

    if (!sess) {
        await bot.sendMessage(chatId, '❌ Сессия истекла. Войдите заново: /start');
        return;
    }

    const result = await api.closeTicket(sess.accessToken, ticketId);

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
    }

    await bot.sendMessage(chatId, '✅ Тикет закрыт!');
    await handleViewTicket(bot, chatId, ticketId);
}

// Переключить уведомления
async function handleToggleNotifications(bot, chatId) {
    const sess = session.getSession(chatId);

    if (!sess) {
        await bot.sendMessage(chatId, '❌ Сессия истекла. Войдите заново: /start');
        return;
    }

    const newState = !sess.notificationsEnabled;

    const result = await api.toggleNotifications(sess.accessToken, newState);

    if (!result.success) {
        await bot.sendMessage(chatId, `❌ Ошибка: ${result.error}`);
        return;
    }

    session.updateSession(chatId, { notificationsEnabled: newState });

    const message = newState
        ? '🔔 Уведомления включены!\n\nВы будете получать сообщения о новых ответах администраторов.'
        : '🔕 Уведомления выключены.';

    await bot.sendMessage(chatId, message, {
        reply_markup: getMainMenuKeyboard(newState)
    });
}

module.exports = {
    handleMenu,
    handleListTickets,
    handleViewTicket,
    handleCreateTicketStart,
    handleTicketSubject,
    handleTicketMessage,
    handleTicketPriority,
    handleAddMessage,
    handleTicketReply,
    handleCloseTicket,
    handleToggleNotifications
};
