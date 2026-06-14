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
    const message = `🎫 Новый тикет #${ticket.id}

От: ${username}
Тема: ${ticket.subject}
Приоритет: ${ticket.priority}
Сообщение: ${initialMessage}

👉 Перейти в панель: ${appUrl}/admin/dashboard.html?ticket=${ticket.id}`;

    for (const chatId of adminChatIds) {
        try {
            await bot.sendMessage(chatId, message);
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
    const message = `💬 Новое сообщение в тикете #${ticketId}

От: ${username}
Сообщение: ${messageContent.substring(0, 200)}${messageContent.length > 200 ? '...' : ''}

👉 Открыть тикет: ${appUrl}/admin/dashboard.html?ticket=${ticketId}`;

    for (const chatId of adminChatIds) {
        try {
            await bot.sendMessage(chatId, message);
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
