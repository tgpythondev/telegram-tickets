# Telegram Bot для системы тикетов

Полнофункциональный Telegram бот для работы с системой поддержки.

## Возможности

### Для пользователей:
- 🔐 Вход и регистрация прямо в Telegram
- ➕ Создание тикетов с выбором приоритета
- 📋 Просмотр списка своих тикетов
- 💬 Добавление сообщений в тикеты
- ✅ Закрытие тикетов
- 🔔 Уведомления о новых ответах администраторов

### Для администраторов:
- 📊 Статистика по всем тикетам
- 🔍 Просмотр всех тикетов с фильтрами
- 💬 Ответы на тикеты пользователей
- ⚙️ Изменение статуса и приоритета
- 👤 Назначение тикетов себе
- 🌐 Быстрый доступ к веб-панели

## Быстрый старт

### 1. Создание бота

1. Напишите @BotFather в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте токен бота

### 2. Получение Chat ID

1. Напишите @userinfobot в Telegram
2. Скопируйте ваш Chat ID

### 3. Установка зависимостей

```bash
cd telegram-bot
npm install
```

### 4. Настройка

```bash
cp .env.example .env
```

Отредактируйте `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
BACKEND_API_URL=http://localhost:3000/api
NODE_ENV=development
```

### 5. Применение миграции БД

```bash
cd ../database
psql -U postgres -d telegram_bots_tickets -f migration_add_telegram.sql
```

### 6. Запуск

**Development (polling):**
```bash
npm start
```

**Production (webhooks):**
```bash
NODE_ENV=production npm start
```

## Использование

### Первый запуск

1. Напишите боту `/start`
2. Нажмите "Регистрация" или используйте `/register username password`
3. После успешной регистрации вы увидите главное меню

### Команды для пользователей

- `/start` - Главное меню
- `/login <username> <password>` - Вход в аккаунт
- `/register <username> <password>` - Регистрация
- `/list` - Список моих тикетов
- `/create` - Создать тикет
- `/notify` - Переключить уведомления
- `/menu` - Главное меню
- `/logout` - Выход
- `/help` - Справка

### Команды для администраторов

- `/tickets` - Все тикеты
- `/stats` - Статистика
- `/menu` - Админ меню

Большинство функций доступно через интерактивные кнопки!

## Создание первого админа

После регистрации обычного пользователя в боте:

```bash
psql -U postgres -d telegram_bots_tickets -c "UPDATE users SET is_admin = TRUE WHERE username = 'ваш_логин';"
```

Перезайдите в бот (`/logout` → `/login`) - теперь вы админ!

## Архитектура

```
telegram-bot/
├── bot.js                  # Главный файл, регистрация команд
├── handlers/
│   ├── auth.handler.js     # Авторизация
│   ├── user.handler.js     # Пользовательские функции
│   └── admin.handler.js    # Админские функции
├── services/
│   └── api.service.js      # API клиент для backend
├── keyboards/
│   ├── user.keyboards.js   # Инлайн кнопки для пользователей
│   └── admin.keyboards.js  # Инлайн кнопки для админов
└── utils/
    └── session.js          # Управление сессиями
```

## FSM (Finite State Machine)

Бот использует машину состояний для мультишаговых операций:

### Создание тикета:
1. `idle` → Пользователь нажимает "Создать тикет"
2. `waiting_ticket_subject` → Бот просит ввести тему
3. `waiting_ticket_message` → Бот просит ввести описание
4. `waiting_ticket_priority` → Бот показывает выбор приоритета
5. `idle` → Тикет создан

### Добавление сообщения:
1. `idle` → Пользователь нажимает "Написать сообщение"
2. `waiting_ticket_reply` → Бот ждет текст
3. `idle` → Сообщение отправлено

### Ответ админа:
1. `idle` → Админ нажимает "Ответить"
2. `waiting_admin_reply` → Бот ждет текст ответа
3. `idle` → Ответ отправлен пользователю

## Webhooks для Production

На Render.com бот автоматически использует webhooks вместо polling.

**Настройка webhook:**

1. Деплой бота на Render.com
2. Получить URL: `https://your-bot-name.onrender.com`
3. В `.env` установить:
   ```
   NODE_ENV=production
   WEBHOOK_URL=https://your-bot-name.onrender.com/webhook
   ```
4. Бот автоматически настроит webhook при запуске

**Проверка webhook:**
```bash
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

## Troubleshooting

**Бот не отвечает:**
- Проверьте, что `TELEGRAM_BOT_TOKEN` правильный
- Убедитесь, что backend запущен на `BACKEND_API_URL`
- Проверьте логи: `node bot.js`

**401/403 ошибки:**
- Сессия истекла - войдите заново `/login`
- Access token живет 15 минут

**Уведомления не приходят:**
- Включите их в боте (кнопка "🔔 Уведомления")
- Проверьте, что backend обновлен (новые endpoints)

**"Сессия истекла":**
- Сессии хранятся в памяти и теряются при перезапуске
- Войдите заново через `/login`
- Для production используйте Redis (будущее улучшение)

## Development

**Запуск с nodemon:**
```bash
npm run dev
```

**Тестирование:**
1. Запустите backend: `cd ../backend && npm start`
2. Запустите бота: `npm start`
3. Откройте Telegram и найдите вашего бота

## Безопасность

- Токены хранятся только в сессиях (память)
- Пароли передаются через HTTPS API
- HTTP-only cookies на backend
- Валидация всех входных данных
- Rate limiting через backend API

## TODO / Будущие улучшения

- [ ] Redis для хранения сессий (для production)
- [ ] Поддержка фото/файлов в тикетах
- [ ] Markdown форматирование в сообщениях
- [ ] Пагинация для длинных списков тикетов
- [ ] Поиск по тикетам
- [ ] Экспорт истории тикета

## Лицензия

MIT
