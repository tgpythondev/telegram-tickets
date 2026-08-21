-- Миграция: OAuth аккаунты (Discord, Google, GitHub)
-- Пользователи смогут входить через OAuth без пароля

-- Пользователи без пароля (созданные через OAuth)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Email пользователя (уникальный, nullable — у password-аккаунтов может быть пустым)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;

-- Привязки внешних OAuth-провайдеров к пользователям
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_user_id VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,

    CONSTRAINT valid_oauth_provider CHECK (provider IN ('discord', 'google', 'github')),
    CONSTRAINT unique_provider_account UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
