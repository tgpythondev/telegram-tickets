-- ============================================================
-- KALIANG dev-режим: упрощённая схема для pg-mem (БД в памяти)
-- Эквивалент init.sql + всех миграций, но без триггеров,
-- plpgsql-функций, GIN-индексов и partial indexes — pg-mem
-- их не поддерживает. Данные живут только в памяти процесса.
-- ============================================================

-- Пользователи (init + migration_add_account_lockout + migration_add_telegram)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    email VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    telegram_chat_id BIGINT UNIQUE,
    telegram_notifications_enabled BOOLEAN DEFAULT TRUE,
    telegram_linked_at TIMESTAMP
);

-- OAuth-привязки (Discord / Google / GitHub)
CREATE TABLE oauth_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    provider VARCHAR(20) NOT NULL,
    provider_user_id VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    CONSTRAINT unique_provider_account UNIQUE (provider, provider_user_id)
);

-- Тикеты (заказы и поддержка различаются по наличию order_config)
CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    subject VARCHAR(200) NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    priority VARCHAR(20) DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    assigned_admin_id INTEGER,
    order_config JSONB
);

-- Сообщения в тикетах
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_admin_reply BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh-токены
CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Аудит безопасности
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Портфолио (migration_add_portfolio + migration_portfolio_i18n_desc)
CREATE TABLE portfolio_projects (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'telegram',
    plan VARCHAR(20) NOT NULL DEFAULT 'mini',
    lang VARCHAR(50),
    price VARCHAR(50),
    term VARCHAR(50),
    bot_url VARCHAR(500),
    source_url VARCHAR(500),
    screenshots JSONB NOT NULL DEFAULT '[]',
    description_ru TEXT NOT NULL DEFAULT '',
    description_pl TEXT NOT NULL DEFAULT '',
    description_en TEXT NOT NULL DEFAULT '',
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Промокоды
CREATE TABLE promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_percent NUMERIC(5,2) DEFAULT 10.00,
    is_free_mini BOOLEAN DEFAULT FALSE,
    max_uses INTEGER DEFAULT NULL,
    use_count INTEGER DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Применения промокодов
CREATE TABLE promo_uses (
    id SERIAL PRIMARY KEY,
    promo_code_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    ticket_id INTEGER,
    chosen_benefit VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_promo_per_user UNIQUE (promo_code_id, user_id)
);
