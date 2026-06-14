# База данных системы тикетов

## Требования

- PostgreSQL 12+ 

## Установка PostgreSQL

### Windows

1. Скачать установщик с https://www.postgresql.org/download/windows/
2. Запустить установщик и следовать инструкциям
3. Запомнить пароль для пользователя `postgres`

### Проверка установки

```bash
psql --version
```

## Настройка базы данных

### 1. Создать базу данных

```bash
# Вход в PostgreSQL
psql -U postgres

# Создать базу данных
CREATE DATABASE telegram_bots_tickets;

# Выход
\q
```

Или одной командой:

```bash
createdb -U postgres telegram_bots_tickets
```

### 2. Запустить миграции

```bash
psql -U postgres -d telegram_bots_tickets -f init.sql
```

### 3. Проверить структуру

```bash
psql -U postgres -d telegram_bots_tickets

# Посмотреть таблицы
\dt

# Посмотреть структуру таблицы
\d users
\d tickets
\d messages
\d refresh_tokens
```

## Создание первого администратора

```bash
psql -U postgres -d telegram_bots_tickets
```

Затем выполнить:

```sql
-- Пароль будет хеширован через bcrypt в приложении
-- Здесь используется временный hash для пароля "admin123"
-- ВАЖНО: замените этот hash после первого входа!

INSERT INTO users (username, password_hash, is_admin) 
VALUES ('admin', '$2b$10$XYZ...', TRUE);
```

**Правильный способ:** Создать админа через API после запуска backend, затем вручную обновить is_admin:

```sql
UPDATE users SET is_admin = TRUE WHERE username = 'your_username';
```

## Строка подключения

Формат для `.env` файла в backend:

```
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/telegram_bots_tickets
```

Где:
- `postgres` - имя пользователя PostgreSQL
- `your_password` - пароль пользователя
- `localhost` - хост (для локальной разработки)
- `5432` - порт PostgreSQL (по умолчанию)
- `telegram_bots_tickets` - имя базы данных

## Структура таблиц

### users
- Хранит пользователей и администраторов
- `is_admin` - флаг для разделения прав доступа

### tickets
- Основная таблица с тикетами
- Связана с users через `user_id` и `assigned_admin_id`
- Статусы: open, in_progress, closed, pending
- Приоритеты: low, normal, high, urgent

### messages
- История сообщений в каждом тикете
- `is_admin_reply` - флаг для отметки ответов от администратора

### refresh_tokens
- Хранит токены для долгосрочных сессий (30 дней)
- Автоматически очищаются при выходе или истечении срока

## Обслуживание

### Очистка истекших токенов

```sql
SELECT cleanup_expired_tokens();
```

Рекомендуется настроить cron задачу для ежедневной очистки:

```sql
-- В psql
SELECT cron.schedule('cleanup-tokens', '0 2 * * *', 'SELECT cleanup_expired_tokens()');
```

### Бэкап

```bash
pg_dump -U postgres telegram_bots_tickets > backup_$(date +%Y%m%d).sql
```

### Восстановление

```bash
psql -U postgres -d telegram_bots_tickets < backup_20260613.sql
```

## Полезные запросы

### Статистика по тикетам

```sql
SELECT 
    status,
    COUNT(*) as count
FROM tickets
GROUP BY status;
```

### Активные пользователи

```sql
SELECT 
    u.username,
    COUNT(t.id) as ticket_count
FROM users u
LEFT JOIN tickets t ON u.id = t.user_id
WHERE u.is_admin = FALSE
GROUP BY u.username
ORDER BY ticket_count DESC;
```

### Средний ответ админа

```sql
SELECT 
    AVG(m.created_at - t.created_at) as avg_response_time
FROM tickets t
JOIN messages m ON t.id = m.ticket_id
WHERE m.is_admin_reply = TRUE
AND m.id = (
    SELECT MIN(id) 
    FROM messages 
    WHERE ticket_id = t.id 
    AND is_admin_reply = TRUE
);
```
