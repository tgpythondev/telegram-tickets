-- Migration: Add promo codes system
-- Date: 2026

-- Таблица промокодов
CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_percent NUMERIC(5,2) DEFAULT 10.00,  -- процент скидки (для percent_10 = 10.00)
    is_free_mini BOOLEAN DEFAULT FALSE,            -- даёт ли бесплатный Mini-бот
    max_uses INTEGER DEFAULT NULL,                 -- NULL = безлимитно
    use_count INTEGER DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT code_not_empty CHECK (char_length(code) > 0),
    CONSTRAINT use_count_non_negative CHECK (use_count >= 0),
    CONSTRAINT discount_valid CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_is_active ON promo_codes(is_active);

-- Таблица применений промокода
CREATE TABLE IF NOT EXISTS promo_uses (
    id SERIAL PRIMARY KEY,
    promo_code_id INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,  -- NULL пока тикет не закрыт
    chosen_benefit VARCHAR(20) NOT NULL,  -- 'free_mini' или 'percent_10'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Один пользователь не может применить один промокод дважды
    CONSTRAINT unique_promo_per_user UNIQUE (promo_code_id, user_id),
    CONSTRAINT valid_benefit CHECK (chosen_benefit IN ('free_mini', 'percent_10'))
);

CREATE INDEX IF NOT EXISTS idx_promo_uses_promo_code_id ON promo_uses(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_user_id ON promo_uses(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_ticket_id ON promo_uses(ticket_id);

COMMENT ON TABLE promo_codes IS 'Промокоды для скидок и бонусов';
COMMENT ON TABLE promo_uses IS 'История применений промокодов пользователями';
COMMENT ON COLUMN promo_codes.max_uses IS 'NULL = безлимитно';
COMMENT ON COLUMN promo_uses.ticket_id IS 'NULL = тикет ещё не закрыт, заполняется при закрытии';
COMMENT ON COLUMN promo_uses.chosen_benefit IS 'free_mini = бесплатный Mini-бот, percent_10 = скидка 10%';
