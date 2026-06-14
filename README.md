# Система тикетов для Telegram-Bots.pl

Полноценная full-stack система поддержки с авторизацией, тикетами и Telegram уведомлениями.

## Структура проекта

```
C:\Users\admin\Desktop\Telegram-Bots.pl\
├── frontend/          # Клиентская часть
├── backend/           # Серверная часть (Node.js + Express)
└── database/          # SQL схемы и миграции
```

## Быстрый старт

### 1. Установка PostgreSQL

**Windows:**
1. Скачать с https://www.postgresql.org/download/windows/
2. Запустить установщик
3. Запомнить пароль для пользователя `postgres`

Проверка:
```bash
psql --version
```

### 2. Создание базы данных

```bash
# Создать БД
createdb -U postgres telegram_bots_tickets

# Запустить миграции
psql -U postgres -d telegram_bots_tickets -f database/init.sql
```

### 3. Настройка backend

```bash
cd backend

# Установить зависимости
npm install

# Создать .env файл
cp .env.example .env
```

Отредактировать `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/telegram_bots_tickets
JWT_ACCESS_SECRET=your_random_secret_here_32_chars_min
JWT_REFRESH_SECRET=another_random_secret_here_32_chars_min
PORT=3000
FRONTEND_URL=http://localhost:8080

# Telegram Bot (опционально, но рекомендуется)
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_ADMIN_CHAT_IDS=your_chat_id,second_admin_chat_id
APP_URL=http://localhost:8080
```

**Как получить Telegram Bot Token:**
1. Написать @BotFather в Telegram
2. Отправить команду `/newbot`
3. Следовать инструкциям
4. Скопировать токен

**Как получить Chat ID:**
1. Написать @userinfobot в Telegram
2. Скопировать свой Chat ID

### 4. Создание первого администратора

```bash
# Запустить backend
cd backend
npm start
```

Backend запустится на http://localhost:3000

**Вариант 1: Через регистрацию**
1. Открыть http://localhost:8080/auth.html
2. Зарегистрироваться (username + password)
3. Остановить backend (Ctrl+C)
4. Сделать пользователя админом:

```bash
psql -U postgres -d telegram_bots_tickets -c "UPDATE users SET is_admin = TRUE WHERE username = 'ваш_логин';"
```

5. Перезапустить backend: `npm start`

**Вариант 2: Через SQL**
```bash
# Сгенерировать hash пароля (например для "admin123")
node -e "console.log(require('bcrypt').hashSync('admin123', 10))"

# Вставить админа
psql -U postgres -d telegram_bots_tickets -c "INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', 'HASH_HERE', TRUE);"
```

### 5. Запуск frontend

```bash
cd frontend
npx http-server -p 8080
```

Или любой другой статический сервер.

Открыть в браузере: http://localhost:8080

## Использование

### Для пользователей

1. Открыть http://localhost:8080
2. Нажать "Поддержка" или "Создать тикет"
3. Зарегистрироваться / Войти
4. Создать тикет с вопросом
5. Следить за ответами администратора

### Для администраторов

1. Войти с админским аккаунтом
2. Автоматический редирект на admin/dashboard.html
3. Просмотр всех тикетов
4. Фильтры: все / открытые / в работе / мои
5. Клик на тикет → детали
6. Ответить, изменить статус, приоритет, назначить себе
7. Telegram уведомления о новых тикетах (если настроено)

## Функции

✅ Регистрация / Вход с логином и паролем
✅ Долгосрочные сессии (30 дней) через HTTP-only cookies
✅ Автоматическое обновление токенов
✅ Создание тикетов с темой и сообщением
✅ Переписка в тикете (пользователь ↔ админ)
✅ Статусы: открыт / в работе / закрыт
✅ Приоритеты: normal / high / urgent
✅ Назначение тикетов админам
✅ Telegram уведомления для админов
✅ Фильтры и поиск
✅ Минималистичный черно-белый дизайн
✅ Адаптивный дизайн для мобильных

## API Endpoints

### Auth
- `POST /api/auth/register` - регистрация
- `POST /api/auth/login` - вход
- `POST /api/auth/logout` - выход
- `POST /api/auth/refresh` - обновление токена
- `GET /api/auth/me` - текущий пользователь

### Tickets (пользователи)
- `GET /api/tickets` - список моих тикетов
- `GET /api/tickets/:id` - детали тикета
- `POST /api/tickets` - создать тикет
- `POST /api/tickets/:id/messages` - добавить сообщение
- `PATCH /api/tickets/:id/status` - закрыть тикет

### Admin (администраторы)
- `GET /api/admin/tickets` - все тикеты
- `PATCH /api/admin/tickets/:id` - обновить тикет
- `POST /api/admin/tickets/:id/reply` - ответить
- `GET /api/admin/stats` - статистика

## Разработка

### Backend (с hot reload)
```bash
cd backend
npm install -g nodemon
npm run dev
```

### Frontend
Просто обновлять файлы, браузер перезагружать вручную.

### База данных
```bash
# Подключиться к БД
psql -U postgres -d telegram_bots_tickets

# Посмотреть таблицы
\dt

# Посмотреть пользователей
SELECT * FROM users;

# Посмотреть тикеты
SELECT * FROM tickets;
```

## Troubleshooting

**Backend не запускается:**
- Проверить, что PostgreSQL запущен
- Проверить DATABASE_URL в .env
- Проверить, что БД создана и миграции применены

**Не работает авторизация:**
- Проверить JWT_ACCESS_SECRET и JWT_REFRESH_SECRET в .env
- Очистить cookies в браузере
- Проверить CORS (FRONTEND_URL должен совпадать с URL фронтенда)

**Telegram уведомления не приходят:**
- Проверить TELEGRAM_BOT_TOKEN в .env
- Проверить TELEGRAM_ADMIN_CHAT_IDS в .env
- Убедиться, что бот не заблокирован
- Написать боту любое сообщение первым

**403 ошибки:**
- Токен истек - обновить страницу
- Недостаточно прав - проверить is_admin в БД

## Production деплой

1. Использовать настоящий домен вместо localhost
2. Настроить SSL/HTTPS (Let's Encrypt)
3. Использовать Nginx для фронтенда и reverse proxy для backend
4. Настроить переменные окружения на сервере
5. Использовать PM2 для запуска backend: `pm2 start server.js`
6. Настроить бэкапы PostgreSQL

## Технологии

**Frontend:**
- Vanilla JavaScript (без фреймворков)
- HTML5 + CSS3
- Fetch API для HTTP запросов

**Backend:**
- Node.js + Express
- PostgreSQL с pg драйвером
- JWT для авторизации
- bcrypt для хеширования паролей
- node-telegram-bot-api для уведомлений

**Database:**
- PostgreSQL 12+

## Лицензия

MIT

## Автор

Kaliang (@Kaliang_dev)
