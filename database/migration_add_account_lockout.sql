-- Migration: Add account lockout fields to users table
-- Date: 2026-06-23

ALTER TABLE users
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

-- Create index for locked_until to improve query performance
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until);

COMMENT ON COLUMN users.failed_login_attempts IS 'Number of consecutive failed login attempts';
COMMENT ON COLUMN users.locked_until IS 'Timestamp until which the account is locked after multiple failed attempts';
