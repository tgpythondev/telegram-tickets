# Прогресс реализации Telegram бота

## ✅ Выполнено

### База данных
- ✅ `database/migration_add_telegram.sql` - миграция для добавления Telegram полей

### Backend обновления
- ✅ `backend/models/db.js` - добавлены функции для Telegram:
  - updateUserTelegramChatId
  - findUserByTelegramChatId
  - toggleTelegramNotifications
  - unlinkTelegramAccount

- ✅ `backend/controllers/auth.controller.js` - добавлены endpoints:
  - linkTelegram
  - unlinkTelegram
  - getTelegramStatus
  - toggleTelegramNotifications

- ✅ `backend/routes/auth.routes.js` - добавлены маршруты для Telegram

### Telegram Bot - Структура
- ✅ `telegram-bot/package.json` - зависимости
- ✅ `telegram-bot/.env.example` - пример конфигурации
- ✅ `telegram-bot/utils/session.js` - управление сессиями
- ✅ `telegram-bot/services/api.service.js` - API клиент (все методы)
- ✅ `telegram-bot/keyboards/user.keyboards.js` - клавиатуры для пользователей
- ✅ `telegram-bot/keyboards/admin.keyboards.js` - клавиатуры для админов
- ✅ `telegram-bot/handlers/auth.handler.js` - авторизация (/start, /login, /register, /logout, /help)

## ⏳ Осталось создать

### Telegram Bot - Handlers (критично)
1. **telegram-bot/handlers/user.handler.js** (~250 строк)
   - handleMenu - главное меню
   - handleCreateTicket - создание тикета (FSM: тема → сообщение → приоритет)
   - handleListTickets - список тикетов
   - handleViewTicket - просмотр конкретного тикета
   - handleReplyToTicket - добавление сообщения
   - handleCloseTicket - закрытие тикета
   - handleToggleNotifications - вкл/выкл уведомлений

2. **telegram-bot/handlers/admin.handler.js** (~300 строк)
   - handleAdminMenu - админ меню
   - handleAdminTickets - список всех тикетов с фильтром
   - handleViewTicketAdmin - просмотр тикета (админ)
   - handleReplyAdmin - ответ на тикет
   - handleUpdateStatus - изменение статуса
   - handleAssignTicket - назначить себе
   - handleStats - статистика

3. **telegram-bot/bot.js** (~200 строк)
   - Инициализация бота
   - Регистрация всех команд
   - Обработка callback queries
   - Webhook/Polling логика
   - Express сервер для webhooks (production)

### Backend - Уведомления
4. **Обновить backend/utils/telegram.js**
   - Добавить sendAdminReplyNotification(userId, ticketId, content)
   
5. **Обновить backend/controllers/admin.controller.js**
   - Вызывать sendAdminReplyNotification при ответе на тикет

### Frontend (опционально)
6. **frontend/tickets.html** - добавить раздел Telegram
7. **frontend/tickets.js** - функции для управления уведомлениями
8. **frontend/api.js** - методы для Telegram endpoints

### Deployment
9. **deployment/neon.md** - инструкция по Neon.tech
10. **deployment/render.md** - инструкция по Render.com
11. **deployment/cloudflare.md** - инструкция по Cloudflare Pages

## 📋 Следующие шаги

### Шаг 1: Применить миграцию БД
```bash
psql -U postgres -d telegram_bots_tickets -f database/migration_add_telegram.sql
```

### Шаг 2: Установить зависимости бота
```bash
cd telegram-bot
npm install
```

### Шаг 3: Создать .env для бота
```bash
cp .env.example .env
# Заполнить TELEGRAM_BOT_TOKEN и BACKEND_API_URL
```

### Шаг 4: Завершить handlers
- Создать user.handler.js на основе плана
- Создать admin.handler.js на основе плана
- Создать bot.js для запуска

### Шаг 5: Тестирование
```bash
# Терминал 1: Backend
cd backend
npm start

# Терминал 2: Telegram Bot
cd telegram-bot
node bot.js

# Терминал 3: Frontend
cd frontend
npx http-server -p 8080
```

## 📝 Ключевая логика для handlers

### user.handler.js - Создание тикета (FSM)
```javascript
// Состояния: idle → waiting_subject → waiting_message → waiting_priority
// 1. Пользователь нажимает "Создать тикет"
// 2. Бот: "Введите тему тикета"
// 3. Состояние: waiting_subject
// 4. Пользователь вводит тему → сохраняем в tempData.subject
// 5. Бот: "Введите описание"
// 6. Состояние: waiting_message
// 7. Пользователь вводит описание → сохраняем в tempData.message
// 8. Бот показывает клавиатуру с приоритетами
// 9. Пользователь выбирает → вызываем API createTicket
// 10. Состояние: idle
```

### admin.handler.js - Просмотр тикетов
```javascript
// 1. Админ выбирает фильтр (открытые/в работе/все)
// 2. Вызываем API getAllTickets с фильтром
// 3. Показываем список inline кнопками (каждый тикет = кнопка)
// 4. Клик на тикет → показываем детали + историю сообщений
// 5. Inline клавиатура: Ответить / Изменить статус / Назначить себе
```

### bot.js - Структура
```javascript
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const authHandler = require('./handlers/auth.handler');
const userHandler = require('./handlers/user.handler');
const adminHandler = require('./handlers/admin.handler');
const session = require('./utils/session');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: process.env.NODE_ENV !== 'production'
});

// Команды
bot.onText(/\/start/, (msg) => authHandler.handleStart(bot, msg));
bot.onText(/\/login (.+)/, (msg) => authHandler.handleLogin(bot, msg));
bot.onText(/\/register (.+)/, (msg) => authHandler.handleRegister(bot, msg));
bot.onText(/\/help/, (msg) => authHandler.handleHelp(bot, msg));
// ... остальные команды

// Callback queries
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Роутинг по callback_data
    if (data.startsWith('auth_')) {
        // auth.handler
    } else if (data.startsWith('ticket')) {
        // user.handler или admin.handler
    } else if (data.startsWith('admin_')) {
        // admin.handler
    }
    
    await bot.answerCallbackQuery(query.id);
});

// Обработка текстовых сообщений (для FSM)
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return; // Команды обрабатываются отдельно

    const sess = session.getSession(msg.chat.id);
    if (!sess) return;

    // FSM для создания тикета
    if (sess.state === 'waiting_subject') {
        // user.handler.handleTicketSubject
    } else if (sess.state === 'waiting_message') {
        // user.handler.handleTicketMessage
    } else if (sess.state === 'waiting_reply') {
        // user.handler.handleTicketReply
    }
});

// Production: Webhooks
if (process.env.NODE_ENV === 'production') {
    const express = require('express');
    const app = express();
    app.use(express.json());
    
    bot.setWebHook(process.env.WEBHOOK_URL);
    
    app.post('/webhook', (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
    
    app.listen(process.env.PORT || 3000);
    console.log('Bot running in webhook mode');
} else {
    console.log('Bot running in polling mode');
}
```

## 🎯 Оценка оставшейся работы

- user.handler.js: 1-1.5 часа
- admin.handler.js: 1.5-2 часа
- bot.js: 30 минут
- Обновление backend уведомлений: 15 минут
- Тестирование: 1 час
- Deployment инструкции: 30 минут

**Итого:** ~5-6 часов

## 📖 Ссылки на план

Полный детальный план: `C:\Users\admin\.claude\plans\floating-munching-cupcake.md`
