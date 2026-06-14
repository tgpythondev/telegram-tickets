# 🚀 Инструкция по развертыванию проекта

Полное руководство по деплою системы тикетов на production серверы.

## Архитектура деплоя

- **Frontend**: Cloudflare Pages (статический хостинг)
- **Backend**: Render.com (Node.js сервер)
- **Database**: Neon.tech (PostgreSQL serverless)
- **Telegram Bot**: Render.com (вместе с backend или отдельный сервис)

---

## 1. База данных (Neon.tech)

### Шаг 1: Создание проекта

1. Зайдите на https://neon.tech
2. Зарегистрируйтесь или войдите
3. Нажмите **"Create a project"**
4. Выберите регион (ближайший к вашим пользователям)
5. Дайте имя проекту: `telegram-bots-tickets`

### Шаг 2: Получение connection string

1. После создания проекта скопируйте **Connection string**
2. Формат: `postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require`
3. Сохраните эту строку - она понадобится для backend

### Шаг 3: Применение миграций

**Вариант 1: Через Neon Console**
1. В проекте откройте вкладку **SQL Editor**
2. Скопируйте содержимое файла `database/init.sql`
3. Вставьте в редактор и выполните
4. Затем выполните `database/migration_add_telegram.sql`

**Вариант 2: Через psql локально**
```bash
# Установите connection string как переменную
export DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require"

# Примените миграции
psql $DATABASE_URL -f database/init.sql
psql $DATABASE_URL -f database/migration_add_telegram.sql
```

### Шаг 4: Создание первого администратора

```bash
# Сгенерируйте hash пароля (например для "admin123")
node -e "console.log(require('bcrypt').hashSync('admin123', 10))"

# Вставьте админа через SQL Editor в Neon
# Замените YOUR_PASSWORD_HASH на полученный hash
INSERT INTO users (username, password_hash, is_admin) 
VALUES ('admin', 'YOUR_PASSWORD_HASH', TRUE);
```

✅ База данных готова!

---

## 2. Backend (Render.com)

### Шаг 1: Подготовка репозитория

1. Создайте GitHub репозиторий для проекта
2. Загрузите туда весь проект:

```bash
cd C:\Users\admin\Desktop\Telegram-Bots.pl
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/telegram-bots.git
git push -u origin main
```

### Шаг 2: Создание Web Service на Render

1. Зайдите на https://render.com
2. Нажмите **"New +"** → **"Web Service"**
3. Подключите GitHub репозиторий
4. Настройки сервиса:
   - **Name**: `telegram-bots-backend`
   - **Region**: выберите ближайший
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### Шаг 3: Переменные окружения

В разделе **Environment** добавьте:

```env
NODE_ENV=production
PORT=3000

# Database (из Neon.tech)
DATABASE_URL=postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require

# JWT секреты (сгенерируйте случайные строки)
JWT_ACCESS_SECRET=your_random_32_char_secret_for_access_token_here_abc123
JWT_REFRESH_SECRET=another_random_32_char_secret_for_refresh_token_xyz789

# Frontend URL (будет после деплоя Cloudflare)
FRONTEND_URL=https://your-site.pages.dev

# Telegram Bot (получить через @BotFather)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_CHAT_IDS=123456789,987654321

# App URL (URL этого backend сервиса)
APP_URL=https://telegram-bots-backend.onrender.com
```

**Как получить JWT секреты:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Как получить Telegram Bot Token:**
1. Напишите @BotFather в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте токен

**Как получить Telegram Admin Chat ID:**
1. Напишите @userinfobot в Telegram
2. Скопируйте ваш Chat ID
3. Для нескольких админов разделяйте запятой: `123456789,987654321`

### Шаг 4: Деплой

1. Нажмите **"Create Web Service"**
2. Render автоматически установит зависимости и запустит сервер
3. После успешного деплоя скопируйте URL: `https://telegram-bots-backend.onrender.com`

✅ Backend готов!

---

## 3. Telegram Bot (Render.com)

### Вариант A: Отдельный сервис (рекомендуется)

1. На Render создайте еще один **Web Service**
2. Настройки:
   - **Name**: `telegram-bots-bot`
   - **Root Directory**: `telegram-bot`
   - **Build Command**: `npm install`
   - **Start Command**: `node bot.js`

3. Переменные окружения:
```env
NODE_ENV=production
TELEGRAM_BOT_TOKEN=your_bot_token_here
BACKEND_API_URL=https://telegram-bots-backend.onrender.com/api
PORT=3000
WEBHOOK_URL=https://telegram-bots-bot.onrender.com/webhook
```

### Вариант B: Вместе с backend

Если хотите запустить бота вместе с backend (для экономии):

1. В backend добавьте в `package.json`:
```json
{
  "scripts": {
    "start": "node server.js & cd ../telegram-bot && node bot.js"
  }
}
```

2. Добавьте переменные бота в backend environment

✅ Telegram бот готов!

---

## 4. Frontend (Cloudflare Pages)

### Шаг 1: Подготовка frontend

Обновите `frontend/api.js`, замените:

```javascript
const API_URL = 'https://telegram-bots-backend.onrender.com/api';
```

Закоммитьте изменения:
```bash
git add frontend/api.js
git commit -m "Update API URL for production"
git push
```

### Шаг 2: Создание проекта на Cloudflare Pages

1. Зайдите на https://dash.cloudflare.com
2. Перейдите в **Pages**
3. Нажмите **"Create a project"**
4. Выберите **"Connect to Git"**
5. Подключите GitHub репозиторий

### Шаг 3: Настройки сборки

- **Project name**: `telegram-bots`
- **Production branch**: `main`
- **Build command**: *(оставьте пустым)*
- **Build output directory**: `frontend`
- **Root directory**: `frontend`

### Шаг 4: Переменные окружения

В Cloudflare Pages переменные не нужны для статического frontend.

### Шаг 5: Деплой

1. Нажмите **"Save and Deploy"**
2. Cloudflare соберет и опубликует сайт
3. После деплоя получите URL: `https://telegram-bots.pages.dev`
4. Можете настроить **custom domain** (например: `bots.kaliang.dev`)

### Шаг 6: Обновите FRONTEND_URL в Backend

Вернитесь в Render.com → Backend Service → Environment:
```env
FRONTEND_URL=https://telegram-bots.pages.dev
APP_URL=https://telegram-bots.pages.dev
```

Сохраните - backend автоматически перезапустится.

✅ Frontend готов!

---

## 5. Финальная настройка CORS

Убедитесь что в `backend/server.js` CORS настроен правильно:

```javascript
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080',
    credentials: true
}));
```

Это уже есть в коде, но проверьте.

---

## 6. Проверка работоспособности

### Проверка Backend
```bash
curl https://telegram-bots-backend.onrender.com/health
# Должно вернуть: {"status":"ok","timestamp":"..."}
```

### Проверка Frontend
1. Откройте `https://telegram-bots.pages.dev`
2. Перейдите на страницу регистрации
3. Создайте аккаунт
4. Создайте тестовый тикет

### Проверка Telegram Bot
1. Найдите бота в Telegram (username из @BotFather)
2. Напишите `/start`
3. Войдите: `/login username password`
4. Создайте тикет через бота

### Проверка уведомлений
1. Создайте тикет через веб-интерфейс
2. Админы должны получить уведомление в Telegram

---

## 7. Мониторинг и логи

### Render.com
- Откройте ваш сервис
- Перейдите в **Logs** для просмотра логов в реальном времени
- В **Metrics** смотрите использование ресурсов

### Cloudflare Pages
- В дашборде Pages → **Analytics** смотрите статистику посещений
- **Deployment logs** показывают процесс сборки

### Neon.tech
- В проекте Neon → **Monitoring** смотрите запросы к БД
- **Branches** позволяет создавать тестовые копии БД

---

## 8. Обновление проекта

### Обновление Frontend
```bash
# Внесите изменения в frontend/
git add .
git commit -m "Update frontend"
git push
# Cloudflare автоматически пересоберет сайт
```

### Обновление Backend
```bash
# Внесите изменения в backend/
git add .
git commit -m "Update backend"
git push
# Render автоматически пересоберет и перезапустит
```

### Миграции БД
```bash
# Примените новую миграцию через Neon SQL Editor
# Или через psql:
psql $DATABASE_URL -f database/new_migration.sql
```

---

## 9. Custom Domain (опционально)

### Для Frontend (Cloudflare Pages)
1. В настройках проекта → **Custom domains**
2. Добавьте ваш домен (например: `bots.kaliang.pl`)
3. Следуйте инструкциям по настройке DNS
4. Cloudflare автоматически выдаст SSL сертификат

### Для Backend (Render.com)
1. В настройках сервиса → **Settings** → **Custom Domain**
2. Добавьте домен (например: `api.kaliang.pl`)
3. Настройте CNAME запись в DNS
4. Render автоматически выдаст SSL

После настройки custom domains обновите переменные окружения с новыми URL.

---

## 10. Troubleshooting

### Backend не стартует на Render
- Проверьте логи в Render → Logs
- Убедитесь что `DATABASE_URL` правильный
- Проверьте что все `JWT_*` секреты установлены

### CORS ошибки
- Убедитесь что `FRONTEND_URL` в backend совпадает с URL Cloudflare Pages
- Проверьте что в `backend/server.js` CORS настроен с `credentials: true`

### Telegram бот не отвечает
- Проверьте что `TELEGRAM_BOT_TOKEN` правильный
- Убедитесь что бот не заблокирован
- Проверьте логи Render для telegram-bot сервиса

### Уведомления не приходят
- Проверьте `TELEGRAM_ADMIN_CHAT_IDS`
- Напишите боту первым `/start`
- Убедитесь что пользователь связал Telegram в веб-интерфейсе

### База данных недоступна
- Проверьте что Neon проект активен (free tier засыпает после 7 дней неактивности)
- Обновите connection string если изменился

---

## 11. Бесплатные лимиты

### Neon.tech (Free)
- 3 проекта
- 10 GB хранилища
- Автоматическое засыпание после 5 минут неактивности
- ✅ Достаточно для малого/среднего проекта

### Render.com (Free)
- 750 часов/месяц
- Засыпает после 15 минут неактивности
- Пробуждение занимает ~30 секунд при первом запросе
- ✅ Достаточно для тестирования и малых проектов

### Cloudflare Pages (Free)
- Unlimited requests
- Unlimited bandwidth
- 500 builds/месяц
- ✅ Более чем достаточно

---

## 12. Улучшения для production

### Безопасность
- [ ] Настроить rate limiting (например, через express-rate-limit)
- [ ] Добавить helmet.js для дополнительных security headers
- [ ] Настроить Content Security Policy
- [ ] Включить 2FA для админов

### Производительность
- [ ] Добавить Redis для кеширования (Upstash бесплатный tier)
- [ ] Оптимизировать SQL запросы (добавить индексы)
- [ ] Использовать CDN для статических файлов

### Мониторинг
- [ ] Настроить Sentry для отслеживания ошибок
- [ ] Добавить Uptime monitoring (UptimeRobot бесплатный)
- [ ] Настроить логирование (Winston + LogDNA)

### Backup
- [ ] Настроить автоматические бэкапы БД в Neon
- [ ] Создать скрипт для экспорта данных

---

## 🎉 Готово!

Ваш проект теперь запущен в production:

- **Frontend**: https://telegram-bots.pages.dev
- **Backend API**: https://telegram-bots-backend.onrender.com
- **Telegram Bot**: @YOUR_BOT_USERNAME
- **Database**: Neon.tech

Теперь вы можете:
1. Делиться ссылкой с клиентами
2. Принимать тикеты
3. Отвечать через веб-панель или Telegram

---

## Контакты

Разработчик: Kaliang (@Kaliang_dev)
Проект: Telegram-Bots.pl
Дата: 2026-06-14
