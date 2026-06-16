require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const session = require('./utils/session');
const authHandler = require('./handlers/auth.handler');
const userHandler = require('./handlers/user.handler');
const adminHandler = require('./handlers/admin.handler');
const { checkRateLimit } = require('./utils/rateLimit');
const { validateCallbackData, validateTicketId, validateStatus, validatePriority, validateFilter, validateChatId } = require('./utils/validation');
const { acquireLock, releaseLock } = require('./utils/fsmLock');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_MODE = process.env.BOT_MODE || 'polling'; // polling или webhook
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (!TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN не установлен в .env');
    process.exit(1);
}

// Инициализация бота
const bot = new TelegramBot(TOKEN, {
    polling: BOT_MODE === 'polling'
});

console.log('🤖 Telegram бот запущен...');
console.log(`Режим: ${BOT_MODE === 'polling' ? 'Long Polling' : 'Webhook'}`);
console.log(`Окружение: ${IS_PRODUCTION ? 'Production' : 'Development'}`);

// ========== КОМАНДЫ ==========

// /start
bot.onText(/\/start/, async (msg) => {
    const rateCheck = checkRateLimit(msg.chat.id, 'command');
    if (!rateCheck.allowed) {
        await bot.sendMessage(msg.chat.id, `⏳ Слишком много запросов. Повторите через ${rateCheck.retryAfter} сек.`);
        return;
    }
    await authHandler.handleStart(bot, msg);
});

// /login username password
bot.onText(/\/login (.+)/, async (msg) => {
    const rateCheck = checkRateLimit(msg.chat.id, 'login');
    if (!rateCheck.allowed) {
        await bot.sendMessage(msg.chat.id, `⛔ Слишком много попыток входа. Повторите через ${rateCheck.retryAfter} сек.`);
        return;
    }
    await authHandler.handleLogin(bot, msg);
});

// /register username password
bot.onText(/\/register (.+)/, async (msg) => {
    const rateCheck = checkRateLimit(msg.chat.id, 'login');
    if (!rateCheck.allowed) {
        await bot.sendMessage(msg.chat.id, `⛔ Слишком много попыток регистрации. Повторите через ${rateCheck.retryAfter} сек.`);
        return;
    }
    await authHandler.handleRegister(bot, msg);
});

// /logout
bot.onText(/\/logout/, async (msg) => {
    await authHandler.handleLogout(bot, msg.chat.id);
});

// /help
bot.onText(/\/help/, async (msg) => {
    await authHandler.handleHelp(bot, msg);
});

// /menu
bot.onText(/\/menu/, async (msg) => {
    const sess = session.getSession(msg.chat.id);
    if (!sess) {
        await bot.sendMessage(msg.chat.id, '❌ Войдите заново: /start');
        return;
    }

    if (sess.isAdmin) {
        await adminHandler.handleAdminMenu(bot, msg.chat.id);
    } else {
        await userHandler.handleMenu(bot, msg.chat.id);
    }
});

// /list - список тикетов
bot.onText(/\/list/, async (msg) => {
    if (!session.isAuthenticated(msg.chat.id)) {
        await bot.sendMessage(msg.chat.id, '❌ Войдите заново: /start');
        return;
    }
    await userHandler.handleListTickets(bot, msg.chat.id);
});

// /create - создать тикет
bot.onText(/\/create/, async (msg) => {
    if (!session.isAuthenticated(msg.chat.id)) {
        await bot.sendMessage(msg.chat.id, '❌ Войдите заново: /start');
        return;
    }
    await userHandler.handleCreateTicketStart(bot, msg.chat.id);
});

// /tickets - админ: все тикеты
bot.onText(/\/tickets/, async (msg) => {
    if (!session.isAdmin(msg.chat.id)) {
        await bot.sendMessage(msg.chat.id, '❌ Требуются права администратора');
        return;
    }
    await adminHandler.handleAdminTickets(bot, msg.chat.id, 'all');
});

// /stats - админ: статистика
bot.onText(/\/stats/, async (msg) => {
    if (!session.isAdmin(msg.chat.id)) {
        await bot.sendMessage(msg.chat.id, '❌ Требуются права администратора');
        return;
    }
    await adminHandler.handleStats(bot, msg.chat.id);
});

// /notify - переключить уведомления
bot.onText(/\/notify/, async (msg) => {
    if (!session.isAuthenticated(msg.chat.id)) {
        await bot.sendMessage(msg.chat.id, '❌ Войдите заново: /start');
        return;
    }
    await userHandler.handleToggleNotifications(bot, msg.chat.id);
});

// ========== CALLBACK QUERIES ==========

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = query.from.id;

    try {
        // Rate limiting для callback queries
        const rateCheck = checkRateLimit(chatId, 'callback');
        if (!rateCheck.allowed) {
            await bot.answerCallbackQuery(query.id, {
                text: `⏳ Слишком много запросов. Повторите через ${rateCheck.retryAfter} сек.`,
                show_alert: true
            });
            return;
        }

        // Валидация callback_data
        const validation = validateCallbackData(data);
        if (!validation.valid) {
            await bot.answerCallbackQuery(query.id, {
                text: 'Некорректные данные',
                show_alert: true
            });
            return;
        }

        // Проверка 1: userId должен совпадать с chatId для личных сообщений
        if (chatId !== userId) {
            await bot.answerCallbackQuery(query.id, {
                text: 'Ошибка: callback из группового чата не поддерживается',
                show_alert: true
            });
            return;
        }

        // Проверка 2: Возраст сообщения (не старше 24 часов)
        const messageDate = query.message.date * 1000;
        const now = Date.now();
        if (now - messageDate > 24 * 60 * 60 * 1000) {
            await bot.answerCallbackQuery(query.id, {
                text: 'Это сообщение устарело. Используйте /menu для обновления.',
                show_alert: true
            });
            return;
        }

        // Проверка 3: Проверка сессии для защищенных операций
        if (data.startsWith('ticket_') || data.startsWith('admin_') ||
            data.startsWith('priority_') || data === 'tickets_list' ||
            data === 'tickets_create') {

            const sess = session.getSession(chatId);
            if (!sess || !sess.accessToken) {
                await bot.answerCallbackQuery(query.id, {
                    text: 'Сессия истекла. Войдите заново: /start',
                    show_alert: true
                });
                return;
            }
        }

        // Валидация ticketId для всех ticket операций
        if (data.startsWith('ticket_view_') || data.startsWith('ticket_reply_') ||
            data.startsWith('ticket_close_') || data.startsWith('admin_ticket_view_') ||
            data.startsWith('admin_reply_') || data.startsWith('admin_assign_')) {

            const ticketId = data.split('_').pop();
            const ticketValidation = validateTicketId(ticketId);

            if (!ticketValidation.valid) {
                await bot.answerCallbackQuery(query.id, {
                    text: 'Некорректный ID тикета',
                    show_alert: true
                });
                return;
            }
        }

        // Валидация admin_status с двумя параметрами
        if (data.startsWith('admin_status_')) {
            const parts = data.replace('admin_status_', '').split('_');
            if (parts.length !== 2) {
                await bot.answerCallbackQuery(query.id, {
                    text: 'Некорректный формат',
                    show_alert: true
                });
                return;
            }

            const [ticketId, status] = parts;
            const ticketValidation = validateTicketId(ticketId);
            const statusValidation = validateStatus(status);

            if (!ticketValidation.valid || !statusValidation.valid) {
                await bot.answerCallbackQuery(query.id, {
                    text: 'Некорректные данные',
                    show_alert: true
                });
                return;
            }
        }

        // Валидация priority
        if (data.startsWith('priority_')) {
            const priority = data.replace('priority_', '');
            const priorityValidation = validatePriority(priority);

            if (!priorityValidation.valid) {
                await bot.answerCallbackQuery(query.id, {
                    text: 'Некорректный приоритет',
                    show_alert: true
                });
                return;
            }
        }

        // Валидация admin filter
        if (data.startsWith('admin_tickets_')) {
            const filter = data.replace('admin_tickets_', '');
            const filterValidation = validateFilter(filter);

            if (!filterValidation.valid) {
                await bot.answerCallbackQuery(query.id, {
                    text: 'Некорректный фильтр',
                    show_alert: true
                });
                return;
            }
        }

        // Auth callbacks
        if (data === 'auth_login') {
            await bot.sendMessage(chatId,
                'Для входа используйте:\n`/login username password`',
                { parse_mode: 'Markdown' }
            );
        } else if (data === 'auth_register') {
            await bot.sendMessage(chatId,
                'Для регистрации используйте:\n`/register username password`',
                { parse_mode: 'Markdown' }
            );
        } else if (data === 'auth_logout') {
            await authHandler.handleLogout(bot, chatId);
        } else if (data === 'help') {
            await authHandler.handleHelp(bot, { chat: { id: chatId } });
        }

        // Main menu
        else if (data === 'main_menu') {
            await userHandler.handleMenu(bot, chatId);
        }

        // User tickets
        else if (data === 'tickets_list') {
            await userHandler.handleListTickets(bot, chatId);
        } else if (data === 'tickets_create') {
            await userHandler.handleCreateTicketStart(bot, chatId);
        } else if (data.startsWith('ticket_view_')) {
            const ticketId = data.replace('ticket_view_', '');
            await userHandler.handleViewTicket(bot, chatId, ticketId);
        } else if (data.startsWith('ticket_reply_')) {
            const ticketId = data.replace('ticket_reply_', '');
            await userHandler.handleAddMessage(bot, chatId, ticketId);
        } else if (data.startsWith('ticket_close_')) {
            const ticketId = data.replace('ticket_close_', '');
            await userHandler.handleCloseTicket(bot, chatId, ticketId);
        }

        // Priority selection
        else if (data.startsWith('priority_')) {
            const priority = data.replace('priority_', '');
            await userHandler.handleTicketPriority(bot, chatId, priority);
        }

        // Notifications
        else if (data === 'toggle_notifications') {
            await userHandler.handleToggleNotifications(bot, chatId);
        }

        // Admin menu
        else if (data === 'admin_menu') {
            await adminHandler.handleAdminMenu(bot, chatId);
        } else if (data.startsWith('admin_tickets_')) {
            const filter = data.replace('admin_tickets_', '');
            await adminHandler.handleAdminTickets(bot, chatId, filter);
        } else if (data.startsWith('admin_ticket_view_')) {
            const ticketId = data.replace('admin_ticket_view_', '');
            await adminHandler.handleViewTicketAdmin(bot, chatId, ticketId);
        } else if (data.startsWith('admin_reply_')) {
            const ticketId = data.replace('admin_reply_', '');
            await adminHandler.handleReplyStart(bot, chatId, ticketId);
        } else if (data.startsWith('admin_status_')) {
            const parts = data.replace('admin_status_', '').split('_');
            const ticketId = parts[0];
            const status = parts[1];
            await adminHandler.handleUpdateStatus(bot, chatId, ticketId, status);
        } else if (data.startsWith('admin_assign_')) {
            const ticketId = data.replace('admin_assign_', '');
            await adminHandler.handleAssignTicket(bot, chatId, ticketId);
        } else if (data === 'admin_stats') {
            await adminHandler.handleStats(bot, chatId);
        }

        await bot.answerCallbackQuery(query.id);
    } catch (error) {
        console.error('Callback query error:', error);
        await bot.answerCallbackQuery(query.id, {
            text: 'Произошла ошибка. Попробуйте снова.',
            show_alert: true
        });
    }
});

// ========== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ (FSM) ==========

bot.on('message', async (msg) => {
    // Пропускаем команды (они обрабатываются отдельно)
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }

    const chatId = msg.chat.id;
    const sess = session.getSession(chatId);

    if (!sess) {
        return;
    }

    // Проверка типа сообщения
    if (!msg.text) {
        if (sess.state && sess.state !== 'idle') {
            await bot.sendMessage(chatId,
                '❌ Пожалуйста, отправьте текстовое сообщение.\n' +
                'Используйте /menu для отмены текущей операции.'
            );
        }
        return;
    }

    // Проверка длины текста
    if (msg.text.length > 10000) {
        await bot.sendMessage(chatId, '❌ Сообщение слишком длинное (максимум 10000 символов).');
        return;
    }

    // ЗАЩИТА ОТ RACE CONDITION
    if (!acquireLock(chatId)) {
        await bot.sendMessage(chatId, '⏳ Подождите, идет обработка предыдущего сообщения...');
        return;
    }

    try {
        // FSM для создания тикета (пользователь)
        if (sess.state === 'waiting_ticket_subject') {
            await userHandler.handleTicketSubject(bot, msg);
        } else if (sess.state === 'waiting_ticket_message') {
            await userHandler.handleTicketMessage(bot, msg);
        } else if (sess.state === 'waiting_ticket_reply') {
            await userHandler.handleTicketReply(bot, msg);
        }

        // FSM для ответа на тикет (админ)
        else if (sess.state === 'waiting_admin_reply') {
            await adminHandler.handleAdminReply(bot, msg);
        }
    } catch (error) {
        console.error('Message handler error:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка. Попробуйте снова или используйте /menu');
        session.updateSession(chatId, { state: 'idle', tempData: {} });
    } finally {
        releaseLock(chatId); // ВСЕГДА освобождаем лок
    }
});

// ========== WEBHOOK (только если BOT_MODE=webhook) ==========

if (BOT_MODE === 'webhook') {
    const app = express();
    app.use(express.json());

    const webhookUrl = process.env.WEBHOOK_URL;
    const port = process.env.PORT || 3000;

    if (!webhookUrl) {
        console.error('❌ WEBHOOK_URL не установлен в .env');
        process.exit(1);
    }

    bot.setWebHook(webhookUrl);

    app.post('/webhook', (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });

    app.get('/', (req, res) => {
        res.send('Telegram Bot is running!');
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.listen(port, () => {
        console.log(`🌐 Webhook сервер запущен на порту ${port}`);
        console.log(`📡 Webhook URL: ${webhookUrl}`);
    });
} else {
    console.log('📡 Polling активен. Бот ожидает сообщения...');
}

// ========== ОБРАБОТКА ОШИБОК ==========

bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error.message);
});

process.on('SIGINT', () => {
    console.log('\n👋 Остановка бота...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Остановка бота...');
    bot.stopPolling();
    process.exit(0);
});

console.log('✅ Бот готов к работе!');
