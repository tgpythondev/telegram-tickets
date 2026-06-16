# 🚨 КРИТИЧЕСКАЯ ИНСТРУКЦИЯ ПО ИСПРАВЛЕНИЮ HTTP 500

## Проблема

**HTTP 500 Internal Server Error** на `/api/auth/register` вызван отсутствием полей `telegram_chat_id`, `telegram_notifications_enabled`, `telegram_linked_at` в таблице `users` на production базе данных.

---

## ⚡ БЫСТРОЕ ИСПРАВЛЕНИЕ (5 минут)

### Вариант 1: Автоматический скрипт (рекомендуется)

```bash
# На production сервере
cd /path/to/Telegram-Bots.pl/database
chmod +x check_and_apply_migrations.sh
./check_and_apply_migrations.sh
```

### Вариант 2: Ручное применение миграции

```bash
# На production сервере
export DATABASE_URL="your_production_database_url"

psql "$DATABASE_URL" << 'EOF'
-- Добавить telegram поля
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMP;

-- Добавить индекс
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
EOF
```

### Вариант 3: Через psql напрямую

```bash
psql your_database_url
```

Затем выполнить:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
```

---

## ✅ Проверка успешного применения

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name LIKE 'telegram%';
```

**Ожидаемый результат:**
```
column_name                       | data_type         | is_nullable
----------------------------------+-------------------+-------------
telegram_chat_id                  | bigint            | YES
telegram_notifications_enabled    | boolean           | YES
telegram_linked_at                | timestamp         | YES
```

---

## 🔄 Перезапуск backend

После применения миграции:

```bash
# PM2
pm2 restart telegram-bots-backend

# Systemd
sudo systemctl restart telegram-bots-backend

# Docker
docker-compose restart backend
```

---

## 🧪 Тестирование

```bash
# Попробовать зарегистрироваться
curl -X POST https://telegram-bots-backend.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(curl -s https://telegram-bots-backend.onrender.com/api/auth/csrf | jq -r '.csrfToken')" \
  -d '{"username":"test'$(date +%s)'","password":"Test1234!@#$"}' \
  -v
```

**Ожидаемый результат:** HTTP 201 Created (вместо 500)

---

## 📋 Чеклист

- [ ] Применена миграция telegram полей
- [ ] Проверено наличие полей в БД
- [ ] Backend перезапущен
- [ ] Регистрация работает (HTTP 201)
- [ ] Логи не содержат ошибок PostgreSQL

---

## 🐛 Если всё еще не работает

1. **Проверить логи сервера:**
```bash
pm2 logs telegram-bots-backend --lines 100
```

2. **Проверить подключение к БД:**
```bash
psql "$DATABASE_URL" -c "SELECT 1;"
```

3. **Проверить версию кода:**
```bash
cd backend
git log -1 --oneline models/db.js
# Должен показать коммит с добавлением telegram полей в RETURNING
```

---

## 🆘 Экстренный откат

Если миграция вызвала проблемы (маловероятно):

```sql
ALTER TABLE users DROP COLUMN IF EXISTS telegram_chat_id;
ALTER TABLE users DROP COLUMN IF EXISTS telegram_notifications_enabled;
ALTER TABLE users DROP COLUMN IF EXISTS telegram_linked_at;
DROP INDEX IF EXISTS idx_users_telegram_chat_id;
```

---

**Дата:** 2026-06-16  
**Время выполнения:** ~5 минут  
**Риск:** Низкий (все команды используют IF NOT EXISTS)
