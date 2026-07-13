# Backend Audit Fixes

## CRITICAL

### 1. SSE auth переписан — `middleware/sseAuth.js`
Было: требовал `?token=` в URL — EventSource браузера не поддерживает кастомные заголовки и query-токены в production setup.  
Стало: сначала проверяет `Authorization: Bearer` (для тестов), затем — `refreshToken` httpOnly-cookie через БД + JWT verify. Полностью соответствует тому, как frontend открывает `/events` с `withCredentials: true`.

### 2 + 3. CSRF middleware полностью переписан — `middleware/csrf.js`
Было: `generateToken()` создавал токен но **не клал в `tokenStore`** → `tokenStore.has()` всегда `false` → каждый POST падал с 403. Плюс: если JWT-токен валиден — CSRF проверка пропускалась полностью.  
Стало: `generateToken()` хранит токен с TTL 1 час. Проверка всегда выполняется независимо от JWT. Cleanup удаляет только просроченные токены (не все подряд). Токен не удаляется после использования — frontend кэширует один токен на сессию.

---

## HIGH

### 4. Logout — добавлен `authenticateToken` — `routes/auth.routes.js`
Было: `POST /auth/logout` шёл сразу в CSRF → `req.user` был `undefined` → audit log падал.  
Стало: `authenticateToken` → `csrfProtection` → `authController.logout`.

### 5. Admin route logger перемещён — `routes/admin.routes.js`
Было: логгер стоял до `authenticateToken` → `req.user` всегда `undefined` в логах.  
Стало: порядок `authenticateToken` → `requireAdmin` → логгер.

### 6. `updateTicket` в БД — `models/db.js`
Было: при `status=closed` в SET добавлялась сырая строка `'closed_at = CURRENT_TIMESTAMP'` — это ломало нумерацию параметров `$N` и приводило к ошибке запроса.  
Стало: `closed_at = CASE WHEN $N = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END` — полностью параметризованный запрос. После UPDATE делается re-fetch с JOIN для корректного shape ответа.

### 7. SSE controller — connId fix — `controllers/sse.controller.js`, `utils/sse.js`
Было: `connId` создавался локально в контроллере, но `addAdmin`/`addUser` не возвращали свой connId → при падении keepAlive нельзя было удалить соединение.  
Стало: `addAdmin`/`addUser` возвращают connId. Контроллер использует его для `sse.removeConnection()` в keepAlive catch.

---

## MEDIUM

### 8. `toggleTelegramNotifications` response — `controllers/auth.controller.js`
Убрано поле `message` из ответа. Возвращает строго `{ notificationsEnabled: boolean }` — точно то, что ожидает frontend (`data.notificationsEnabled`).

### 9. `getAdminStats` — `models/db.js`
PostgreSQL возвращает `COUNT(*)` как строку. Добавлен `parseInt(..., 10)` для всех четырёх полей. Frontend ожидает числа.

### 10. CORS no-origin bypass — `server.js`
Было: запросы без `Origin` заголовка (curl, Postman, server-to-server) пропускались безусловно.  
Стало: в production блокируются с ошибкой `Origin header required`. В development по-прежнему разрешены для удобства.

### 11. Rate limiter — `middleware/rateLimit.js`
Было: самодельный in-memory `Map` — не работает при многопроцессорном деплое, сбрасывается при рестарте.  
Стало: `express-rate-limit` с `keyGenerator` по `req.user.id` — per-user лимиты, стандартные заголовки `RateLimit-*`.

### 12. Audit log шум — `middleware/auth.js`
Было: каждый запрос с отсутствующим/невалидным токеном логировался как `LOGIN_FAILED` — засоряло audit log.  
Стало: лишние вызовы `logAuditEvent` удалены. Настоящие `LOGIN_FAILED` логируются только в `auth.controller.js` при реальных попытках входа.

---

## LOW

### 13. SSE controller — дублирующий `connId`, `username` в `req.user`
Убрана дублирующая переменная `connId`. В `sseAuth` добавлено поле `username` в `req.user`.

### 14. `package.json` start script — `package.json`
Было: `"start": "node server.js & cd ../telegram-bot && node bot.js"` — оператор `&` работает только в CMD/bash, не на Linux/Render.  
Стало: два отдельных скрипта `"start"` и `"start:bot"`. Сервер и бот запускаются независимо.

---

## Файлы изменены
- `middleware/sseAuth.js`
- `middleware/csrf.js`
- `middleware/auth.js`
- `middleware/rateLimit.js`
- `controllers/sse.controller.js`
- `controllers/auth.controller.js`
- `routes/auth.routes.js`
- `routes/admin.routes.js`
- `models/db.js`
- `utils/sse.js`
- `server.js`
- `package.json`

---

## Round 2 — Post-verification fixes

### CSRF token invalidation on logout — `middleware/csrf.js`, `controllers/auth.controller.js`
Добавлен `csrfProtection.invalidateToken(token)`. Вызывается в `logout()` по значению заголовка `X-CSRF-Token`. Токен удаляется из `tokenStore` немедленно — не ждёт TTL 1 час.

### `replyToTicket` — maxLength validation — `controllers/admin.controller.js`
Добавлена проверка `content.length > 5000` с возвратом 400. Паритет с `addMessage` в tickets controller. Убрано логирование тела сообщения (`console.log('[REPLY] Content:', content)`).

### `listAllTickets` — валидация `status` query-param — `controllers/admin.controller.js`
`?status=foo` теперь возвращает 400 вместо молчаливого пустого массива. Валидные значения: `open`, `in_progress`, `closed`.

### `message_count` приводится к числу — `models/db.js`
`CAST(COUNT(*) AS INTEGER)` вместо сырого `COUNT(*)`. pg не будет возвращать строку.

### `admin:ticket:new` SSE payload — `controllers/tickets.controller.js`
Добавлено явное поле `assigned_admin_username: null`. Теперь shape нового тикета в SSE полностью совпадает с `AdminTicket` объектом который ожидает frontend.

### SSE отдельный rate limiter — `server.js`
`/api/events` выведен из-под `generalLimiter` (100 req/20s) и получил собственный `sseLimiter` (20 reconnects/min). Исключает блокировку SSE при активном использовании API.

### Rate limiter — документация single-instance ограничения — `middleware/rateLimit.js`
Добавлен комментарий с инструкцией по миграции на Redis store при multi-instance деплое на Render.
