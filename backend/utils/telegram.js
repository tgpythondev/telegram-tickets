const TelegramBot = require('node-telegram-bot-api');

let bot = null;
let adminChatIds = [];

// Экранирование Markdown символов
function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// Инициализация бота
function initTelegramBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatIds = process.env.TELEGRAM_ADMIN_CHAT_IDS;

    console.log('🔧 Инициализация Telegram бота для уведомлений...');
    console.log('TOKEN установлен:', !!token);
    console.log('CHAT_IDS установлены:', !!chatIds);

    if (!token || !chatIds) {
        console.warn('⚠️ Telegram bot не настроен. Укажите TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_IDS в .env');
        return;
    }

    try {
        bot = new TelegramBot(token, { polling: false });
        adminChatIds = chatIds.split(',').map(id => id.trim());
        console.log('✅ Telegram bot инициализирован для отправки уведомлений');
        console.log(`📋 Количество админов: ${adminChatIds.length}`);
    } catch (error) {
        console.error('❌ Ошибка инициализации Telegram бота:', error.message);
    }
}

// Отправка уведомления о новом тикете
async function sendNewTicketNotification(ticket, username, initialMessage) {
    console.log('📤 Попытка отправить уведомление о новом тикете #' + ticket.id);

    if (!bot || adminChatIds.length === 0) {
        console.log('⚠️ Telegram уведомления отключены (bot:', !!bot, ', adminChatIds:', adminChatIds.length, ')');
        return;
    }

    const appUrl = process.env.APP_URL || 'https://telegram-bots.pl';

    // Форматирование даты и времени
    const now = new Date();
    const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const message = `🔎 *Новый тикет!*

👤 От: @${escapeMarkdown(username)}
📋 Тема: *${escapeMarkdown(ticket.subject)}*
🕐 ${date} в ${time}

📝 *Описание:*
${escapeMarkdown(initialMessage.substring(0, 300))}${initialMessage.length > 300 ? '...' : ''}

ℹ️ _Ответьте как можно скорее на тикет!_

👉 [Открыть в веб-панели](${appUrl}/admin/dashboard.html?ticket=${ticket.id})`;

    console.log(`📨 Отправка уведомления ${adminChatIds.length} админам...`);

    for (const chatId of adminChatIds) {
        try {
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            console.log(`✅ Уведомление отправлено админу: ${chatId}`);
        } catch (error) {
            console.error(`❌ Ошибка отправки уведомления в chat ${chatId}:`, error.message);
        }
    }
}

// Отправка уведомления о новом сообщении от пользователя
async function sendNewMessageNotification(ticketId, username, messageContent) {
    if (!bot || adminChatIds.length === 0) {
        console.log('Telegram уведомления отключены');
        return;
    }

    const appUrl = process.env.APP_URL || 'https://telegram-bots.pl';

    // Форматирование даты и времени
    const now = new Date();
    const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const message = `💬 *Новое сообщение в тикете #${ticketId}*

👤 От: @${escapeMarkdown(username)}
🕐 ${date} в ${time}

📝 *Сообщение:*
${escapeMarkdown(messageContent.substring(0, 300))}${messageContent.length > 300 ? '...' : ''}

👉 [Ответить в веб-панели](${appUrl}/admin/dashboard.html?ticket=${ticketId})`;

    for (const chatId of adminChatIds) {
        try {
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(`Ошибка отправки уведомления в chat ${chatId}:`, error.message);
        }
    }
}

// Отправка уведомления пользователю об ответе администратора
async function sendAdminReplyNotification(ticket, adminUsername, replyContent) {
    console.log(`📤 Попытка отправить уведомление пользователю о ответе на тикет #${ticket.id}`);

    if (!bot) {
        console.log('⚠️ Telegram bot не инициализирован');
        return;
    }

    try {
        // Получить данные владельца тикета
        const dbModule = require('../models/db');
        const user = await dbModule.findUserById(ticket.user_id);

        if (!user) {
            console.log(`⚠️ Пользователь #${ticket.user_id} не найден`);
            return;
        }

        // Проверить настройки уведомлений
        if (!user.telegram_chat_id) {
            console.log(`⚠️ У пользователя ${user.username} не привязан Telegram`);
            return;
        }

        if (!user.telegram_notifications_enabled) {
            console.log(`⚠️ Пользователь ${user.username} отключил уведомления`);
            return;
        }

        // Форматирование даты и времени
        const now = new Date();
        const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        // Обрезать контент для превью
        const preview = replyContent.length > 200 ? replyContent.substring(0, 200) + '...' : replyContent;

        const message = `╔══════════════════════════════╗
║  💬 НОВЫЙ ОТВЕТ АДМИНИСТРАЦИИ  ║
╚══════════════════════════════╝

🎫 *Тикет #${ticket.id}*
📌 Тема: ${escapeMarkdown(ticket.subject)}

👨‍💼 *Администратор ${escapeMarkdown(adminUsername)}*
⏰ ${date} в ${time}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *Ответ:*
${escapeMarkdown(preview)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_Нажмите кнопку ниже для просмотра полного ответа_`;

        // Inline-кнопка для открытия тикета
        const keyboard = {
            inline_keyboard: [[
                { text: '📋 Открыть тикет', callback_data: `ticket_view_${ticket.id}` }
            ]]
        };

        await bot.sendMessage(user.telegram_chat_id, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        console.log(`✅ Уведомление отправлено пользователю ${user.username} (chat_id: ${user.telegram_chat_id})`);
    } catch (error) {
        console.error(`❌ Ошибка отправки уведомления пользователю:`, error.message);
        // Не прерываем выполнение - уведомление не критично для основного flow
    }
}

// Отправка уведомления пользователю о смене статуса тикета
async function sendTicketStatusChangeNotification(ticket, oldStatus, newStatus, adminUsername) {
    console.log(`📤 Попытка отправить уведомление о смене статуса тикета #${ticket.id}: ${oldStatus} → ${newStatus}`);

    if (!bot) {
        console.log('⚠️ Telegram bot не инициализирован');
        return;
    }

    try {
        const dbModule = require('../models/db');
        const user = await dbModule.findUserById(ticket.user_id);

        if (!user || !user.telegram_chat_id || !user.telegram_notifications_enabled) {
            console.log(`⚠️ Уведомления для пользователя #${ticket.user_id} недоступны`);
            return;
        }

        // Эмодзи для статусов
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

        const now = new Date();
        const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        const message = `╔══════════════════════════════╗
║   🔄 ИЗМЕНЕН СТАТУС ТИКЕТА    ║
╚══════════════════════════════╝

🎫 *Тикет #${ticket.id}*
📌 ${escapeMarkdown(ticket.subject)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${statusEmoji[oldStatus] || '⚪'} *${statusNames[oldStatus] || oldStatus}*
          ⬇️
${statusEmoji[newStatus] || '⚪'} *${statusNames[newStatus] || newStatus}*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👨‍💼 Администратор: ${escapeMarkdown(adminUsername)}
⏰ ${date} в ${time}`;

        const keyboard = {
            inline_keyboard: [[
                { text: '📋 Открыть тикет', callback_data: `ticket_view_${ticket.id}` }
            ]]
        };

        await bot.sendMessage(user.telegram_chat_id, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        console.log(`✅ Уведомление о смене статуса отправлено пользователю ${user.username}`);
    } catch (error) {
        console.error(`❌ Ошибка отправки уведомления о смене статуса:`, error.message);
    }
}

// Отправка уведомления пользователю о назначении администратора
async function sendTicketAssignedNotification(ticket, adminUsername) {
    console.log(`📤 Попытка отправить уведомление о назначении админа на тикет #${ticket.id}`);

    if (!bot) {
        console.log('⚠️ Telegram bot не инициализирован');
        return;
    }

    try {
        const dbModule = require('../models/db');
        const user = await dbModule.findUserById(ticket.user_id);

        if (!user || !user.telegram_chat_id || !user.telegram_notifications_enabled) {
            console.log(`⚠️ Уведомления для пользователя #${ticket.user_id} недоступны`);
            return;
        }

        const now = new Date();
        const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        const message = `╔══════════════════════════════╗
║ 👨‍💼 ТИКЕТ ВЗЯТ В РАБОТУ         ║
╚══════════════════════════════╝

🎫 *Тикет #${ticket.id}*
📌 ${escapeMarkdown(ticket.subject)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Ваш вопрос рассматривается

👨‍💼 Администратор: *${escapeMarkdown(adminUsername)}*
⏰ ${date} в ${time}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_Ожидайте ответа в ближайшее время_`;

        const keyboard = {
            inline_keyboard: [[
                { text: '📋 Открыть тикет', callback_data: `ticket_view_${ticket.id}` }
            ]]
        };

        await bot.sendMessage(user.telegram_chat_id, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        console.log(`✅ Уведомление о назначении отправлено пользователю ${user.username}`);
    } catch (error) {
        console.error(`❌ Ошибка отправки уведомления о назначении:`, error.message);
    }
}

module.exports = {
    initTelegramBot,
    sendNewTicketNotification,
    sendNewMessageNotification,
    sendAdminReplyNotification,
    sendTicketStatusChangeNotification,
    sendTicketAssignedNotification
};
