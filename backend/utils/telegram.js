const TelegramBot = require('node-telegram-bot-api');

let bot = null;
let adminChatIds = [];

// Инициализация бота
function initTelegramBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatIds = process.env.TELEGRAM_ADMIN_CHAT_IDS;

    if (!token || !chatIds) {
        console.warn('Telegram bot не настроен. Пропустите TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_IDS в .env');
        return;
    }

    try {
        bot = new TelegramBot(token, { polling: false });
        adminChatIds = chatIds.split(',').map(id => id.trim());
        console.log('Telegram bot инициализирован. Админов:', adminChatIds.length);
    } catch (error) {
        console.error('Ошибка инициализации Telegram бота:', error.message);
    }
}

// Отправка уведомления о новом тикете
async function sendNewTicketNotification(ticket, username, initialMessage) {
    if (!bot || adminChatIds.length === 0) {
        console.log('Telegram уведомления отключены');
        return;
    }

    const appUrl = process.env.APP_URL || 'http://localhost:8080';

    // Форматирование даты и времени
    const now = new Date();
    const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const message = `🔎 *Новый тикет!*

👤 От: @${username}
📋 Тема: *${ticket.subject}*
🕐 ${date} в ${time}

📝 *Описание:*
${initialMessage.substring(0, 300)}${initialMessage.length > 300 ? '...' : ''}

ℹ️ _Ответьте как можно скорее на тикет!_

👉 [Открыть в веб-панели](${appUrl}/admin/dashboard.html?ticket=${ticket.id})`;

    for (const chatId of adminChatIds) {
        try {
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(`Ошибка отправки уведомления в chat ${chatId}:`, error.message);
        }
    }
}

// Отправка уведомления о новом сообщении от пользователя
async function sendNewMessageNotification(ticketId, username, messageContent) {
    if (!bot || adminChatIds.length === 0) {
        console.log('Telegram уведомления отключены');
        return;
    }

    const appUrl = process.env.APP_URL || 'http://localhost:8080';

    // Форматирование даты и времени
    const now = new Date();
    const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const message = `💬 *Новое сообщение в тикете #${ticketId}*

👤 От: @${username}
🕐 ${date} в ${time}

📝 *Сообщение:*
${messageContent.substring(0, 300)}${messageContent.length > 300 ? '...' : ''}

👉 [Ответить в веб-панели](${appUrl}/admin/dashboard.html?ticket=${ticketId})`;

    for (const chatId of adminChatIds) {
        try {
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error(`Ошибка отправки уведомления в chat ${chatId}:`, error.message);
        }
    }
}

module.exports = {
    initTelegramBot,
    sendNewTicketNotification,
    sendNewMessageNotification
};
