#!/bin/bash
# Скрипт для применения миграции order_config на production

set -e  # Остановиться при ошибке

echo "🔍 Проверка наличия колонки order_config..."

# Проверка наличия колонки
COLUMN_EXISTS=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'order_config';")

if [ "$COLUMN_EXISTS" -gt 0 ]; then
    echo "✅ Колонка order_config уже существует"
else
    echo "⚠️  Колонка order_config отсутствует. Применяем миграцию..."

    # Применение миграции
    psql $DATABASE_URL -f database/migrations/add_order_config.sql

    echo "✅ Миграция применена успешно"
fi

# Проверка индекса
INDEX_EXISTS=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'tickets' AND indexname = 'idx_tickets_order_config';")

if [ "$INDEX_EXISTS" -gt 0 ]; then
    echo "✅ Индекс idx_tickets_order_config существует"
else
    echo "⚠️  Индекс отсутствует. Создаем..."
    psql $DATABASE_URL -c "CREATE INDEX IF NOT EXISTS idx_tickets_order_config ON tickets USING GIN (order_config);"
    echo "✅ Индекс создан"
fi

echo ""
echo "📊 Текущая структура таблицы tickets:"
psql $DATABASE_URL -c "\d tickets"

echo ""
echo "✅ Миграция завершена успешно!"
