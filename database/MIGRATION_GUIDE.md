# Инструкция по применению миграций БД

## Для существующих баз данных

Если у вас уже запущена база данных, выполните следующие миграции в порядке:

### 1. Добавление полей для блокировки аккаунта

```bash
psql $DATABASE_URL -f database/migration_add_account_lockout.sql
```

Или вручную в PostgreSQL:

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until);
```

### 2. Добавление таблицы audit_logs

```bash
DATABASE_URL -f database/migration_add_audit_logs.sql
```

Или вручную в PostgreSQL:

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTApsql $MP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata ON audit_logs USING GIN (metadata);
```

## Для новых установок

Используйте обновлённый `database/init.sql`, который уже включает все необходимые изменения:

```bash
psql $DATABASE_URL -f database/init.sql
```

## Проверка применения миграций

После применения миграций проверьте структуру таблиц:

```sql
-- Проверка таблицы users
\d users

-- Проверка таблицы audit_logs
\d audit_logs
```

Должны быть видны новые поля:
- `users.failed_login_attempts`
- `users.locked_until`
- Таблица `audit_logs` со всеми полями

## Откат миграций (если необходимо)

### Откат блокировки аккаунтов:

```sql
ALTER TABLE users
DROP COLUMN IF EXISTS failed_login_attempts,
DROP COLUMN IF EXISTS locked_until;

DROP INDEX IF EXISTS idx_users_locked_until;
```

### Откат audit logs:

```sql
DROP TABLE IF EXISTS audit_logs;
```
