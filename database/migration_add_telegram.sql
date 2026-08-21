-- Migration: Telegram integration fields for users
-- Required on fresh databases (init.sql не содержит эти поля)

ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMP;

-- Index для быстрого поиска по telegram chat id
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);

COMMENT ON COLUMN users.telegram_chat_id IS 'Telegram chat ID for notifications';
COMMENT ON COLUMN users.telegram_notifications_enabled IS 'Whether user has enabled telegram notifications';
COMMENT ON COLUMN users.telegram_linked_at IS 'When telegram account was linked';
