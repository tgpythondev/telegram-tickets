-- Migration: Add audit_logs table for security event tracking
-- Date: 2026-06-23

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata ON audit_logs USING GIN (metadata);

COMMENT ON TABLE audit_logs IS 'Security audit log for authentication and sensitive operations';
COMMENT ON COLUMN audit_logs.action IS 'Type of action: login_success, login_failed, account_locked, register, etc.';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context about the event (JSON)';
