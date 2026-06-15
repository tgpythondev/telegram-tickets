-- Migration: Add order_config field to tickets table
-- Date: 2026-06-15
-- Description: Adds JSONB field to store order configuration data

-- Add order_config column
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS order_config JSONB;

-- Add index for better query performance on order_config
CREATE INDEX IF NOT EXISTS idx_tickets_order_config ON tickets USING GIN (order_config);

-- Add comment
COMMENT ON COLUMN tickets.order_config IS 'JSON configuration for bot orders including package, language, hosting, priority details';
