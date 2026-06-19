# Исправление ошибки 403 при refresh токена

## Проблема

Ошибка **403 Forbidden** при обновлении access token через `/api/auth/refresh` возникала из-за:

1. **Cross-origin cookie проблемы** - `sameSite: 'lax'` блокировал cookies между `telegram-tickets.tgpythondev.workers.dev` (frontend) и `telegram-bots-backend.onrender.com` (backend)
2. **Циклический retry** - при 403 на `/auth/refresh` фронтенд пытался refresh снова, создавая бесконечный цикл
3. **Сброс CSRF токена** - после refresh терялся CSRF токен, что могло вызвать проблемы с последующими запросами

## Внесенные изменения

### 1. Frontend (`frontend/api.js`)

**Изменение 1:** Удален сброс CSRF токена после refresh
```javascript
// БЫЛО:
if (data && data.accessToken) {
    inMemoryAccessToken = data.accessToken;
    csrfToken = null; // ❌ Убрано
    return true;
}

// СТАЛО:
if (data && data.accessToken) {
    inMemoryAccessToken = data.accessToken;
    return true;
}
```

**Изменение 2:** Предотвращен циклический retry для `/auth/refresh`
```javascript
// Добавлена проверка endpoint !== '/auth/refresh'
if ((response.status === 403 || response.status === 401) && endpoint !== '/auth/refresh') {
    const refreshed = await refreshAccessToken();
    // ...
}
```

### 2. Backend (`backend/controllers/auth.controller.js`)

**Изменение 1:** Обновлены настройки cookie для cross-origin запросов

В обеих функциях `register()` и `login()`:
```javascript
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // ✅ Изменено
    maxAge: 30 * 24 * 60 * 60 * 1000
};
```

**Важно:** `sameSite: 'none'` требует `secure: true`, что работает только через HTTPS.

**Изменение 2:** Добавлено детальное логирование в `refresh()` функцию
```javascript
console.log('[AUTH] Refresh token request received');
console.log('[AUTH] Has refresh token cookie:', !!refreshToken);
console.log('[AUTH] Token found in DB:', !!tokenData);
console.log('[AUTH] JWT verification passed, user ID:', payload.id);
console.log('[AUTH] New access token generated for user:', user.username);
```

## Необходимые действия для деплоя

### 1. Проверить environment variables на Render.com

**Backend сервис на Render.com:**

1. Зайти в Dashboard → ваш backend сервис → Environment
2. Проверить/установить переменную `FRONTEND_URL`:
   ```
   FRONTEND_URL=https://telegram-tickets.tgpythondev.workers.dev
   ```
   **ВАЖНО:** БЕЗ trailing slash!

3. Убедиться, что `NODE_ENV=production`

4. Проверить наличие других обязательных переменных:
   - `JWT_ACCESS_SECRET` (минимум 32 символа)
   - `JWT_REFRESH_SECRET` (минимум 32 символа)
   - `DATABASE_URL`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_ADMIN_CHAT_IDS`
   - `SESSION_ENCRYPTION_KEY` (64 hex символа)

### 2. Деплой изменений

**Backend:**
```bash
cd backend
git add .
git commit -m "Fix 403 error on token refresh for cross-origin setup"
git push origin main
```

Render.com автоматически задеплоит изменения.

**Frontend:**

Если фронтенд на Cloudflare Workers/Pages:
```bash
cd frontend
# Для Cloudflare Pages через git:
git add .
git commit -m "Fix refresh token logic to prevent infinite retry"
git push origin main

# Или для Cloudflare Workers через wrangler:
npx wrangler pages publish frontend
```

### 3. Проверка после деплоя

**Шаг 1:** Откройте DevTools → Network tab

**Шаг 2:** Зайдите на `https://telegram-tickets.tgpythondev.workers.dev`

**Шаг 3:** Выполните login

**Проверки:**
- ✅ POST `/api/auth/login` возвращает статус 200
- ✅ В Response Headers есть `Set-Cookie: refreshToken=...`
- ✅ Cookie флаги: `HttpOnly; Secure; SameSite=None`

**Шаг 4:** Через 15+ минут (или принудительно сделать запрос с невалидным access token)

**Проверки:**
- ✅ POST `/api/auth/refresh` возвращает 200 с новым `accessToken`
- ✅ В Console нет ошибок "Ошибка подключения к серверу"
- ✅ Пользователь остается авторизованным

### 4. Проверка логов на Render.com

Зайти в Logs вашего backend сервиса и найти:
```
[AUTH] Refresh token request received
[AUTH] Has refresh token cookie: true
[AUTH] Token found in DB: true
[AUTH] JWT verification passed, user ID: ...
[AUTH] New access token generated for user: ...
```

Если видите `Has refresh token cookie: false` - проблема с CORS или cookie настройками.

## Дополнительные проверки при проблемах

### Если cookies не отправляются

**Проблема:** `[AUTH] Has refresh token cookie: false` в логах

**Решения:**

1. Проверить CORS в `backend/server.js`:
   ```javascript
   app.use(cors({
       origin: process.env.FRONTEND_URL, // Должен совпадать с реальным URL фронтенда
       credentials: true
   }));
   ```

2. Убедиться, что frontend делает запросы с `credentials: 'include'`:
   ```javascript
   fetch(url, { credentials: 'include' })
   ```

3. В production убедиться, что оба домена используют HTTPS

### Если токен не найден в БД

**Проблема:** `[AUTH] Token found in DB: false`

**Причины:**
- Токен истек (срок жизни 30 дней)
- Пользователь выполнил logout
- База данных была очищена

**Решение:** Пользователю нужно выполнить login заново.

### Если JWT верификация не проходит

**Проблема:** Ошибка в catch блоке с `Invalid or expired refresh token`

**Причины:**
- `JWT_REFRESH_SECRET` изменился между login и refresh
- Токен был подделан или поврежден

**Решение:** Убедиться, что `JWT_REFRESH_SECRET` одинаковый во всех деплоях.

## Cloudflare Workers дополнительные настройки

Если фронтенд на Cloudflare Workers, проверить:

1. **Firewall Rules** - убедиться, что нет блокировки запросов к `telegram-bots-backend.onrender.com`
2. **Security Level** - установить "Medium" или ниже для избежания ложных срабатываний
3. **Browser Integrity Check** - может блокировать некоторые AJAX запросы

## Rollback при проблемах

Если после деплоя возникли новые проблемы:

```bash
git revert HEAD
git push origin main
```

И в Render.com environment вернуть `sameSite: 'lax'` через manual deploy с предыдущего коммита.

## Успешный результат

После применения всех изменений:
- ✅ Login работает
- ✅ Access token автоматически обновляется каждые 15 минут
- ✅ Нет ошибок 403 при refresh
- ✅ Пользователь остается в системе до 30 дней (пока не истечет refresh token)
- ✅ Нет необходимости в повторном логине при каждом посещении
