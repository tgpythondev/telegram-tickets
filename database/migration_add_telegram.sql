-- Миграция для добавления Telegram интеграции
-- Дата: 2026-06-13

-- Добавление Telegram полей в таблицу users
ALTER TABLE users
ADD COLUMN telegram_chat_id BIGINT UNIQUE,
ADD COLUMN telegram_notifications_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN telegram_linked_at TIMESTAMP;

-- Индекс для быстрого поиска по telegram_chat_id
CREATE INDEX idx_users_telegram_chat_id ON users(telegram_chat_id);

-- Комментарии
COMMENT ON COLUMN users.telegram_chat_id IS 'Telegram Chat ID пользователя для уведомлений';
COMMENT ON COLUMN users.telegram_notifications_enabled IS 'Включены ли Telegram уведомления';
COMMENT ON COLUMN users.telegram_linked_at IS 'Дата и время привязки Telegram аккаунта';
