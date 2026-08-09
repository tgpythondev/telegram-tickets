-- Migration: add portfolio_projects table
-- Run once against the production database

CREATE TABLE IF NOT EXISTS portfolio_projects (
    id            SERIAL PRIMARY KEY,
    title         VARCHAR(200)  NOT NULL,
    description   TEXT          NOT NULL,
    platform      VARCHAR(20)   NOT NULL  DEFAULT 'telegram',
    plan          VARCHAR(20)   NOT NULL  DEFAULT 'mini',
    lang          VARCHAR(50),
    price         VARCHAR(50),
    term          VARCHAR(50),
    bot_url       VARCHAR(500),
    source_url    VARCHAR(500),
    screenshots   JSONB         NOT NULL  DEFAULT '[]',
    features      JSONB         NOT NULL  DEFAULT '[]',
    is_visible    BOOLEAN       NOT NULL  DEFAULT TRUE,
    sort_order    INTEGER       NOT NULL  DEFAULT 0,
    created_at    TIMESTAMP     NOT NULL  DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP     NOT NULL  DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_platform CHECK (platform IN ('telegram', 'discord')),
    CONSTRAINT valid_plan     CHECK (plan     IN ('mini', 'miniplus', 'standard', 'max', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_portfolio_platform   ON portfolio_projects(platform);
CREATE INDEX IF NOT EXISTS idx_portfolio_plan       ON portfolio_projects(plan);
CREATE INDEX IF NOT EXISTS idx_portfolio_is_visible ON portfolio_projects(is_visible);
CREATE INDEX IF NOT EXISTS idx_portfolio_sort_order ON portfolio_projects(sort_order);

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION update_portfolio_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_portfolio_projects_updated_at'
    ) THEN
        CREATE TRIGGER update_portfolio_projects_updated_at
            BEFORE UPDATE ON portfolio_projects
            FOR EACH ROW
            EXECUTE FUNCTION update_portfolio_updated_at();
    END IF;
END;
$$;
