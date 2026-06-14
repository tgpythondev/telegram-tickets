# ⚡ Быстрый старт (локальная разработка)

Запуск проекта за 5 минут для локальной разработки и тестирования.

## Предварительные требования

- Node.js 16+ (проверка: `node --version`)
- PostgreSQL 12+ (проверка: `psql --version`)
- Git
- Telegram аккаунт (для тестирования бота)

---

## 1. База данных (2 минуты)

```bash
# Создать БД
createdb -U postgres telegram_bots_tickets

# Применить миграции
cd C:\Users\admin\Desktop\Telegram-Bots.pl
psql -U postgres -d telegram_bots_tickets -f database/init.sql
psql -U postgres -d telegram_bots_tickets -f database/migration_add_telegram.sql

# Создать первого админа
# Сначала генерируем hash пароля "admin123"
node -e "console.log(require('bcrypt').hashSync('admin123', 10))"

# Вставить админа (замените HASH на результат из предыдущей команды)
psql -U postgres -d telegram_bots_tickets -c "INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', 'HASH', TRUE);"
```

**Готово!** ✅

---

## 2. Backend (1 минута)

```bash
cd backend

# Установить зависимости
npm install

# Создать .env
copy .env.example .env
```

Отредактируйте `backend/.env`:

```env
# Минимальная конфигурация для локального запуска
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/telegram_bots_tickets
JWT_ACCESS_SECRET=local_dev_secret_key_for_access_token_min_32_chars_abc123
JWT_REFRESH_SECRET=local_dev_secret_key_for_refresh_token_min_32_chars_xyz789
PORT=3000
FRONTEND_URL=http://localhost:8080

# Telegram (опционально, можно оставить пустым)
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_IDS=
APP_URL=http://localhost:8080
```

Запустить:
```bash
npm start
```

Backend запущен на **http://localhost:3000** ✅

---

## 3. Frontend (30 секунд)

Откройте **новый терминал**:

```bash
cd C:\Users\admin\Desktop\Telegram-Bots.pl\frontend
npx http-server -p 8080
```

Frontend запущен на **http://localhost:8080** ✅

---

## 4. Telegram Bot (опционально, 2 минуты)

Если хотите протестировать Telegram интеграцию:

### Получить Bot Token:
1. Напишите @BotFather в Telegram
2. Отправьте `/newbot`
3. Название: `My Test Bot`
4. Username: `my_test_bot` (должен заканчиваться на `_bot`)
5. Скопируйте токен

### Получить Chat ID:
1. Напишите @userinfobot
2. Скопируйте ваш Chat ID

### Настроить и запустить:

```bash
cd C:\Users\admin\Desktop\Telegram-Bots.pl\telegram-bot

# Установить зависимости
npm install

# Создать .env
copy .env.example .env
```

Отредактируйте `telegram-bot/.env`:
```env
TELEGRAM_BOT_TOKEN=your_token_from_botfather
BACKEND_API_URL=http://localhost:3000/api
NODE_ENV=development
```

Также обновите `backend/.env`:
```env
TELEGRAM_BOT_TOKEN=your_token_from_botfather
TELEGRAM_ADMIN_CHAT_IDS=your_chat_id
```

Перезапустите backend, затем запустите бота в новом терминале:
```bash
cd C:\Users\admin\Desktop\Telegram-Bots.pl\telegram-bot
node bot.js
```

Bot запущен! ✅

---

## 5. Тестирование

### Тест 1: Веб-интерфейс
1. Откройте http://localhost:8080
2. Нажмите "Поддержка" или перейдите на `/auth.html`
3. Войдите как админ: `admin` / `admin123`
4. Вы попадете на админ-панель
5. Выйдите и зарегистрируйте обычного пользователя
6. Создайте тикет

### Тест 2: Telegram Bot (если настроен)
1. Найдите бота в Telegram
2. Напишите `/start`
3. Войдите: `/login admin admin123`
4. Вы увидите админское меню
5. Посмотрите тикеты

### Тест 3: Уведомления
1. Создайте тикет через веб-интерфейс
2. Админы должны получить уведомление в Telegram

---

## Структура запущенных сервисов

После запуска у вас будет:

| Сервис | URL | Порт |
|--------|-----|------|
| Frontend | http://localhost:8080 | 8080 |
| Backend API | http://localhost:3000 | 3000 |
| PostgreSQL | localhost | 5432 |
| Telegram Bot | - | - |

---

## Быстрые команды

### Просмотр логов БД
```bash
psql -U postgres -d telegram_bots_tickets
\dt                          # Список таблиц
SELECT * FROM users;         # Все пользователи
SELECT * FROM tickets;       # Все тикеты
SELECT * FROM messages;      # Все сообщения
\q                           # Выход
```

### Сделать пользователя админом
```bash
psql -U postgres -d telegram_bots_tickets -c "UPDATE users SET is_admin = TRUE WHERE username = 'username';"
```

### Очистить все данные (кроме схемы)
```bash
psql -U postgres -d telegram_bots_tickets -c "TRUNCATE users, tickets, messages, refresh_tokens CASCADE;"
```

### Пересоздать БД с нуля
```bash
dropdb -U postgres telegram_bots_tickets
createdb -U postgres telegram_bots_tickets
psql -U postgres -d telegram_bots_tickets -f database/init.sql
psql -U postgres -d telegram_bots_tickets -f database/migration_add_telegram.sql
```

---

## Разработка с hot reload

### Backend с автоперезагрузкой
```bash
cd backend
npm install -g nodemon
npm run dev    # Использует nodemon
```

### Frontend
Просто редактируйте файлы, браузер перезагружайте вручную (F5)

---

## Остановка сервисов

1. **Backend**: `Ctrl + C` в терминале backend
2. **Frontend**: `Ctrl + C` в терминале frontend
3. **Telegram Bot**: `Ctrl + C` в терминале bot
4. **PostgreSQL**: Останется запущен в фоне (это нормально)

---

## Типичные проблемы

### "Порт 3000 уже занят"
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Или измените PORT в .env на другой (например 3001)
```

### "Порт 8080 уже занят"
```bash
# Запустите на другом порту
npx http-server -p 8081
```

### "Database connection error"
- Проверьте что PostgreSQL запущен
- Проверьте пароль в DATABASE_URL
- Проверьте что база создана: `psql -U postgres -l | grep telegram`

### "JWT error"
- Убедитесь что JWT секреты в .env минимум 32 символа

### Telegram бот не отвечает
- Проверьте токен
- Убедитесь что backend запущен
- Проверьте BACKEND_API_URL в telegram-bot/.env

---

## Следующие шаги

После локального тестирования:

1. **Деплой на production** → см. [DEPLOYMENT.md](DEPLOYMENT.md)
2. **Настройка custom domain** → в DEPLOYMENT.md раздел 9
3. **Мониторинг и улучшения** → в DEPLOYMENT.md разделы 10-12

---

## Полезные ссылки

- [README.md](README.md) - Полная документация проекта
- [DEPLOYMENT.md](DEPLOYMENT.md) - Инструкция по деплою
- [Backend API](http://localhost:3000/health) - Health check
- [Frontend](http://localhost:8080) - Главная страница

---

**Готово! Проект запущен локально** 🎉

Теперь вы можете разрабатывать, тестировать и улучшать систему тикетов.

Разработчик: Kaliang (@Kaliang_dev)  
Проект: Telegram-Bots.pl  
Версия: 1.0.0  
Дата: 2026-06-14
