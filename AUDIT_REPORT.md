# Аудит Cookie и Environment Variables
**Дата:** 2026-06-19  
**Проект:** Telegram-Bots.pl Ticket System

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### 1. **Cross-Origin Cookie Problem (403 на /auth/refresh)**

**Проблема из лога:**
```
POST https://telegram-bots-backend.onrender.com/api/auth/refresh
[HTTP/3 403  291ms]
```

**Причина:** Cookie с `refreshToken` не отправляется из-за несоответствия настроек cross-origin.

**Местоположение:** `backend/controllers/auth.controller.js:56-61, 120-125`

**Текущие настройки cookie:**
```javascript
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000  // 30 дней
};
```

**Проблемы:**
- ✅ `httpOnly: true` - правильно (защита от XSS)
- ⚠️ `secure` зависит от `NODE_ENV` - **НЕ УСТАНОВЛЕНА** переменная окружения
- ⚠️ `sameSite` зависит от `NODE_ENV` - вероятно использует `'lax'` вместо `'none'`
- ❌ Отсутствует `domain` настройка для cross-origin сценариев

---

### 2. **Отсутствие критических Environment Variables**

**Проверка показала:** `.env` файл отсутствует в backend директории.

**Обязательные переменные из `.env.example`:**

#### ❌ Не установлены:
- `NODE_ENV` - **КРИТИЧНО** (влияет на cookie settings)
- `DATABASE_URL` 
- `JWT_ACCESS_SECRET` (должен быть >= 32 символа)
- `JWT_REFRESH_SECRET` (должен быть >= 32 символа)
- `FRONTEND_URL` - **КРИТИЧНО** (влияет на CORS)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_CHAT_IDS`
- `SESSION_ENCRYPTION_KEY`

**Валидация в коде:** `backend/server.js:19-62` проверяет их при старте, но production деплой использует другие механизмы (Render.com env vars).

---

### 3. **CORS Configuration Issues**

**Местоположение:** `backend/server.js:96-99`

```javascript
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080',
    credentials: true
}));
```

**Проблемы:**
- Если `FRONTEND_URL` не установлен, используется localhost
- Frontend фактически работает на `https://telegram-tickets.tgpythondev.workers.dev`
- Backend на `https://telegram-bots-backend.onrender.com`
- ❌ **Несоответствие origin** → CORS блокирует cookies

---

## ⚠️ СРЕДНИЕ ПРОБЛЕМЫ

### 4. **CSRF Token Implementation**

**Местоположение:** `backend/middleware/csrf.js`

**Проблемы:**
```javascript
// Строка 28: Очень простая валидация
if (token.length === 64 && /^[a-f0-9]+$/.test(token)) {
    return next();
}
```

- ❌ Токен не привязан к сессии пользователя
- ❌ Отсутствует TTL (time-to-live)
- ❌ Используется `Map()` в памяти - при рестарте сервера все токены теряются
- ⚠️ Комментарий в коде предлагает Redis для production

**Рекомендация:** Внедрить Redis или привязать CSRF к refresh token.

---

### 5. **Cookie Clearing на Logout**

**Местоположение:** `backend/controllers/auth.controller.js:152`

```javascript
res.clearCookie('refreshToken');
```

**Проблема:** `clearCookie` не учитывает `sameSite` и `secure` параметры.

**Правильный способ:**
```javascript
res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
});
```

---

### 6. **Frontend Cookie Handling**

**Местоположение:** `frontend/api.js:114-117`

```javascript
const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',  // ✅ Правильно
});
```

- ✅ `credentials: 'include'` установлен
- ✅ Автоматический retry при 403/401
- ⚠️ Но если backend не отправляет cookie правильно, это не поможет

---

## 🟡 НИЗКОПРИОРИТЕТНЫЕ ЗАМЕЧАНИЯ

### 7. **JWT Secrets Validation**

**Местоположение:** `backend/server.js:35-43`

Проверка работает только при локальном запуске с `.env` файлом. В production (Render.com) нужна дополнительная валидация.

### 8. **Rate Limiting**

**Местоположение:** `backend/server.js:69-85`

- ✅ Есть general limiter (100 req/20s)
- ✅ Есть auth limiter (10 req/20s)
- ⚠️ Но refresh endpoint получает auth limiter - может быть проблемой при активной работе

### 9. **In-Memory Token Storage на Frontend**

**Местоположение:** `frontend/api.js:6`

```javascript
let inMemoryAccessToken = null;
```

- ✅ Правильный подход для защиты от XSS
- ⚠️ При обновлении страницы токен теряется → требуется refresh через cookie

---

## 📋 ПЛАН ИСПРАВЛЕНИЯ

### Этап 1: Немедленные действия (КРИТИЧНО)

1. **Установить environment variables на Render.com:**
   ```bash
   NODE_ENV=production
   FRONTEND_URL=https://telegram-tickets.tgpythondev.workers.dev
   DATABASE_URL=<your_postgres_url>
   JWT_ACCESS_SECRET=<generate_32+_chars>
   JWT_REFRESH_SECRET=<generate_32+_chars>
   ```

2. **Проверить текущие настройки на Render.com:**
   - Dashboard → Environment → Environment Variables
   - Убедиться что `NODE_ENV=production` установлена
   - Убедиться что `FRONTEND_URL` соответствует фактическому URL

3. **Redeploy backend** после установки переменных

### Этап 2: Исправление cookie настроек

**Файл:** `backend/controllers/auth.controller.js`

```javascript
// Вынести в отдельную функцию для переиспользования
function getCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
        httpOnly: true,
        secure: isProduction,  // true в production
        sameSite: isProduction ? 'none' : 'lax',  // 'none' для cross-origin
        maxAge: 30 * 24 * 60 * 60 * 1000,
        // domain можно не указывать, если backend и frontend на разных доменах
    };
}

// Использовать в register, login
res.cookie('refreshToken', refreshToken, getCookieOptions());

// И в logout
res.clearCookie('refreshToken', getCookieOptions());
```

### Этап 3: Улучшение CSRF

**Файл:** `backend/middleware/csrf.js`

Рекомендуется:
- Привязать токен к session/user
- Добавить TTL (например, 1 час)
- Использовать Redis для production

### Этап 4: Мониторинг

Добавить логирование в `refresh` endpoint:

```javascript
// В auth.controller.js:refresh()
console.log('[AUTH] Request headers:', {
    origin: req.headers.origin,
    cookie: req.headers.cookie ? 'present' : 'missing',
    userAgent: req.headers['user-agent']
});
```

---

## 🔍 ПРОВЕРКА ПОСЛЕ ИСПРАВЛЕНИЙ

### Тест 1: Проверить cookie в браузере
1. Открыть DevTools → Application → Cookies
2. После login должна появиться cookie `refreshToken`:
   - `HttpOnly`: ✅
   - `Secure`: ✅
   - `SameSite`: None
   - `Domain`: `.onrender.com` или без domain

### Тест 2: Проверить refresh работает
```bash
# Из директории backend
node test-refresh.js
```

### Тест 3: Проверить CORS headers
```bash
curl -X OPTIONS https://telegram-bots-backend.onrender.com/api/auth/refresh \
  -H "Origin: https://telegram-tickets.tgpythondev.workers.dev" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

Должно вернуть:
```
Access-Control-Allow-Origin: https://telegram-tickets.tgpythondev.workers.dev
Access-Control-Allow-Credentials: true
```

---

## 📊 РЕЗЮМЕ

### Основная причина 403 на /auth/refresh:

1. **NODE_ENV не установлена** → `sameSite: 'lax'` вместо `'none'`
2. **FRONTEND_URL не установлена** → CORS блокирует cross-origin cookies
3. **Cookie не отправляется** из браузера → backend возвращает 403

### Срочность действий:

🔴 **Немедленно:**
- Установить `NODE_ENV=production`
- Установить `FRONTEND_URL=https://telegram-tickets.tgpythondev.workers.dev`
- Redeploy

🟡 **В течение недели:**
- Исправить `clearCookie` в logout
- Улучшить CSRF implementation
- Добавить мониторинг

🟢 **Опционально:**
- Внедрить Redis для CSRF токенов
- Добавить cookie domain strategy
- Улучшить rate limiting для refresh endpoint

---

## 🛠️ ДОПОЛНИТЕЛЬНЫЕ ИНСТРУМЕНТЫ

### Генерация JWT Secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Проверка текущих env vars на Render:
```bash
# В Render.com Dashboard → Logs
# Искать строки:
✅ Все переменные окружения проверены
```

### Тестирование локально с правильными настройками:
```bash
cd backend
NODE_ENV=production FRONTEND_URL=https://telegram-tickets.tgpythondev.workers.dev npm start
```

---

**Автор аудита:** Claude (Kiro)  
**Следующий аудит:** После внедрения исправлений
