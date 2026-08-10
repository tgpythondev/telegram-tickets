-- ============================================================
-- Performance indexes migration
-- Применять: psql $DATABASE_URL -f add_performance_indexes.sql
-- Все индексы создаются с IF NOT EXISTS — безопасно повторять
-- ============================================================

-- 1. refresh_tokens.token — используется в каждом запросе к /refresh и SSE auth.
--    Без индекса — sequential scan по всей таблице токенов.
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token
    ON refresh_tokens (token);

-- 2. refresh_tokens.expires_at — используется в WHERE expires_at > CURRENT_TIMESTAMP
--    и при плановой очистке DELETE WHERE expires_at < CURRENT_TIMESTAMP.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
    ON refresh_tokens (expires_at);

-- 3. promo_codes: функциональный индекс на UPPER(code).
--    Запрос: WHERE UPPER(code) = UPPER($1) — без индекса full scan + функция на каждой строке.
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_codes_upper_code
    ON promo_codes (UPPER(code));

-- 4. promo_uses(user_id) — используется в findPendingPromoUse и hasUserUsedPromo.
CREATE INDEX IF NOT EXISTS idx_promo_uses_user_id
    ON promo_uses (user_id);

-- 5. promo_uses(promo_code_id, user_id) — составной индекс для hasUserUsedPromo:
--    WHERE promo_code_id = $1 AND user_id = $2
CREATE INDEX IF NOT EXISTS idx_promo_uses_promo_user
    ON promo_uses (promo_code_id, user_id);

-- 6. audit_logs(user_id, created_at DESC) — для getUserAuditLogs:
--    WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
    ON audit_logs (user_id, created_at DESC);

-- 7. tickets(user_id) — для findUserTickets: WHERE user_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_tickets_user_id
    ON tickets (user_id);

-- 8. tickets(status) — для findAllTickets с фильтром по статусу
CREATE INDEX IF NOT EXISTS idx_tickets_status
    ON tickets (status);

-- 9. messages(ticket_id) — для findTicketMessages и GROUP BY в findAllTickets
CREATE INDEX IF NOT EXISTS idx_messages_ticket_id
    ON messages (ticket_id);
