#!/bin/bash
# Скрипт для проверки и применения всех недостающих миграций
# Использование: ./check_and_apply_migrations.sh

set -e  # Остановиться при ошибке

echo "========================================="
echo "🔍 ПРОВЕРКА МИГРАЦИЙ БД"
echo "========================================="
echo ""

# Проверка переменной DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL не установлен"
    exit 1
fi

echo "✅ DATABASE_URL установлен"
echo ""

# ========== ПРОВЕРКА TELEGRAM ПОЛЕЙ ==========
echo "📋 Проверка telegram полей в таблице users..."

TELEGRAM_FIELDS=$(psql "$DATABASE_URL" -t -c "
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('telegram_chat_id', 'telegram_notifications_enabled', 'telegram_linked_at');
")

TELEGRAM_COUNT=$(echo $TELEGRAM_FIELDS | xargs)

if [ "$TELEGRAM_COUNT" -eq 3 ]; then
    echo "✅ Все telegram поля существуют (3/3)"
else
    echo "⚠️  Telegram поля отсутствуют ($TELEGRAM_COUNT/3)"
    echo "📝 Применяю миграцию migration_add_telegram.sql..."

    psql "$DATABASE_URL" << 'EOF'
-- Add telegram integration fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMP;

-- Add index for faster telegram lookups
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);

-- Add comments
COMMENT ON COLUMN users.telegram_chat_id IS 'Telegram chat ID for notifications';
COMMENT ON COLUMN users.telegram_notifications_enabled IS 'Whether user has enabled telegram notifications';
COMMENT ON COLUMN users.telegram_linked_at IS 'When telegram account was linked';
EOF

    if [ $? -eq 0 ]; then
        echo "✅ Миграция telegram полей применена успешно"
    else
        echo "❌ Ошибка при применении миграции telegram"
        exit 1
    fi
fi

echo ""

# ========== ПРОВЕРКА ORDER_CONFIG ==========
echo "📋 Проверка order_config в таблице tickets..."

ORDER_CONFIG_EXISTS=$(psql "$DATABASE_URL" -t -c "
SELECT COUNT(*)
FROM information_schema.columns
WHERE table_name = 'tickets' AND column_name = 'order_config';
")

ORDER_COUNT=$(echo $ORDER_CONFIG_EXISTS | xargs)

if [ "$ORDER_COUNT" -eq 1 ]; then
    echo "✅ Поле order_config существует"
else
    echo "⚠️  Поле order_config отсутствует"
    echo "📝 Применяю миграцию add_order_config.sql..."

    psql "$DATABASE_URL" << 'EOF'
-- Add order_config to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS order_config JSONB;

-- Add GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_tickets_order_config ON tickets USING GIN (order_config);

-- Update constraints
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS valid_priority;
ALTER TABLE tickets ADD CONSTRAINT valid_priority CHECK (priority IN ('normal', 'high', 'urgent'));

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE tickets ADD CONSTRAINT valid_status CHECK (status IN ('open', 'in_progress', 'closed'));

-- Add comment
COMMENT ON COLUMN tickets.order_config IS 'JSON configuration for bot orders';
EOF

    if [ $? -eq 0 ]; then
        echo "✅ Миграция order_config применена успешно"
    else
        echo "❌ Ошибка при применении миграции order_config"
        exit 1
    fi
fi

echo ""
echo "========================================="
echo "📊 ИТОГОВАЯ СТРУКТУРА БД"
echo "========================================="
echo ""

echo "📋 Структура таблицы users:"
psql "$DATABASE_URL" -c "\d users"

echo ""
echo "📋 Структура таблицы tickets:"
psql "$DATABASE_URL" -c "\d tickets"

echo ""
echo "========================================="
echo "✅ ВСЕ МИГРАЦИИ ПРОВЕРЕНЫ И ПРИМЕНЕНЫ"
echo "========================================="
