# Инструкция по применению исправлений на production

## 🎯 Цель
Исправить ошибки HTTP 403 и HTTP 500 в production окружении

---

## 📋 Что было исправлено

### 1. ✅ `backend/models/db.js`
- **Функция `findUserById()`** - добавлены поля `telegram_chat_id`, `telegram_notifications_enabled`, `telegram_linked_at`
- **Функция `createUser()`** - добавлены те же поля в RETURNING

### 2. ✅ `backend/controllers/auth.controller.js`
- **Функция `register()`** - добавлены fallback значения для telegram полей
- **Функция `me()`** - добавлено поле `telegram_linked_at`

---

## 🚀 Шаги деплоя на production

### Шаг 1: Бэкап текущей БД (ОБЯЗАТЕЛЬНО!)
```bash
# На production сервере
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Шаг 2: Обновление кода
```bash
# Перейти в директорию проекта
cd /path/to/Telegram-Bots.pl

# Получить последние изменения
git pull origin main

# Или скопировать измененные файлы вручную:
# - backend/models/db.js
# - backend/controllers/auth.controller.js
```

### Шаг 3: Применение миграции БД
```bash
# Вариант 1: Использовать скрипт (рекомендуется)
chmod +x database/apply_migration.sh
./database/apply_migration.sh

# Вариант 2: Вручную через psql
psql $DATABASE_URL -f database/migrations/add_order_config.sql

# Вариант 3: Прямые SQL команды
psql $DATABASE_URL << EOF
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS order_config JSONB;
CREATE INDEX IF NOT EXISTS idx_tickets_order_config ON tickets USING GIN (order_config);
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS valid_priority;
ALTER TABLE tickets ADD CONSTRAINT valid_priority CHECK (priority IN ('normal', 'high', 'urgent'));
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE tickets ADD CONSTRAINT valid_status CHECK (status IN ('open', 'in_progress', 'closed'));
EOF
```

### Шаг 4: Проверка миграции
```bash
# Проверить наличие колонки
psql $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'order_config';"

# Ожидаемый результат:
# column_name  | data_type
# -------------+-----------
# order_config | jsonb

# Проверить индекс
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'tickets' AND indexname = 'idx_tickets_order_config';"

# Ожидаемый результат:
# indexname
# --------------------------
# idx_tickets_order_config
```

### Шаг 5: Установка зависимостей (если нужно)
```bash
cd backend
npm install
```

### Шаг 6: Перезапуск backend
```bash
# Если используется PM2
pm2 restart telegram-bots-backend

# Если используется systemd
sudo systemctl restart telegram-bots-backend

# Если Docker
docker-compose restart backend
```

### Шаг 7: Мониторинг логов
```bash
# PM2
pm2 logs telegram-bots-backend --lines 100

# Systemd
sudo journalctl -u telegram-bots-backend -f

# Docker
docker-compose logs -f backend
```

---

## ✅ Проверка работоспособности

### 1. Тест регистрации через curl
```bash
# Получить CSRF токен
CSRF_TOKEN=$(curl -s https://telegram-bots-backend.onrender.com/api/auth/csrf | jq -r '.csrfToken')

# Регистрация
curl -X POST https://telegram-bots-backend.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"username":"testuser'$(date +%s)'","password":"Test1234!@#$"}' \
  -v

# Ожидаемый результат: HTTP 201
# Response должен содержать:
# {
#   "user": {
#     "id": ...,
#     "username": "...",
#     "isAdmin": false,
#     "telegram_chat_id": null,
#     "telegram_notifications_enabled": false
#   },
#   "accessToken": "..."
# }
```

### 2. Тест через UI
1. Открыть https://telegram-tickets.tgpythondev.workers.dev/auth.html
2. Попробовать зарегистрироваться с новым username
3. Должен успешно создаться аккаунт без ошибки 500

### 3. Проверка логов на наличие ошибок
```bash
pm2 logs telegram-bots-backend --lines 50 | grep -i error

# Не должно быть ошибок типа:
# - "column does not exist"
# - "undefined property"
# - "Cannot read property 'telegram_chat_id'"
```

---

## 🔄 Rollback (если что-то пошло не так)

### Откат кода
```bash
git checkout HEAD~1 -- backend/models/db.js backend/controllers/auth.controller.js
pm2 restart telegram-bots-backend
```

### Откат миграции (ОСТОРОЖНО!)
```bash
# Только если миграция вызвала проблемы
psql $DATABASE_URL << EOF
ALTER TABLE tickets DROP COLUMN IF EXISTS order_config;
DROP INDEX IF EXISTS idx_tickets_order_config;
EOF
```

### Восстановление из бэкапа
```bash
# Полное восстановление БД (КРАЙНИЙ СЛУЧАЙ)
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
```

---

## 📊 Ожидаемые результаты

### До исправлений:
- ❌ HTTP 500 на `/api/auth/register`
- ❌ Пользователи не могут зарегистрироваться
- ❌ Возможны ошибки при получении профиля (`/api/auth/me`)

### После исправлений:
- ✅ HTTP 201 на `/api/auth/register`
- ✅ Регистрация работает корректно
- ✅ Все telegram поля возвращаются правильно (null/false для новых пользователей)
- ✅ Функционал order_config готов к использованию

---

## 🐛 Известные ограничения

1. **HTTP 403 на `/refresh`** - НЕ исправлен в этом деплое
   - Причина: проблема скорее всего на стороне клиента (истечение cookie)
   - Решение: будет исследовано отдельно

2. **Старые пользователи в БД** - имеют NULL в telegram полях
   - Это нормально - поля заполнятся при первой привязке Telegram

---

## 📞 Контакты для поддержки

В случае проблем при деплое:
- Проверить логи PM2/systemd
- Проверить подключение к БД
- Убедиться что миграция применена (см. Шаг 4)
- Проверить права доступа к файлам

---

**Дата создания:** 2026-06-16  
**Автор:** Kiro AI  
**Версия:** 1.0
