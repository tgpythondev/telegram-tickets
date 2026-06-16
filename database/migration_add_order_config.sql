-- Миграция для добавления order_config
-- Дата: 2026-06-16

-- Добавление поля order_config для хранения конфигурации заказа
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS order_config JSONB;

-- Индекс для быстрого поиска по order_config
CREATE INDEX IF NOT EXISTS idx_tickets_order_config ON tickets USING GIN (order_config);

-- Обновление constraint для priority (убираем 'low' и 'pending' из status)
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS valid_priority;
ALTER TABLE tickets ADD CONSTRAINT valid_priority CHECK (priority IN ('normal', 'high', 'urgent'));

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE tickets ADD CONSTRAINT valid_status CHECK (status IN ('open', 'in_progress', 'closed'));

-- Комментарии
COMMENT ON COLUMN tickets.order_config IS 'Конфигурация заказа бота из конфигуратора (JSON)';
