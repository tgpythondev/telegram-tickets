# Диагностика проблемы 403 при refresh токена

## Результаты тестирования

### ✅ Что работает корректно:
1. **CORS настроен правильно** - preflight запросы проходят
2. **Cookie устанавливается с правильными флагами**:
   - `HttpOnly: true`
   - `Secure: true`
   - `SameSite: None` ✅ (для cross-origin)
3. **База данных подключена**
4. **CSRF endpoint работает**
5. **Backend возвращает 401 без токена** (правильное поведение)

### ❌ Проблема:

**Браузер НЕ отправляет refresh token cookie обратно на сервер при запросе `/api/auth/refresh`**

Это происходит из-за ограничений браузера на third-party cookies при cross-origin запросах.

## Причина проблемы

Когда фронтенд (`telegram-tickets.tgpythondev.workers.dev`) делает запрос к бэкенду (`telegram-bots-backend.onrender.com`), это **cross-site запрос**. 

Современные браузеры блокируют third-party cookies по умолчанию, даже с `SameSite=None; Secure`.

### Браузерные ограничения:

- **Chrome/Edge**: Блокируют third-party cookies по умолчанию (с 2024)
- **Firefox**: Включена Enhanced Tracking Protection
- **Safari**: Intelligent Tracking Prevention активна по умолчанию

## Решения

### 🎯 Решение 1: Использовать один домен (РЕКОМЕНДУЕТСЯ)

**Вариант А: Reverse proxy через Cloudflare Workers**

Настроить Cloudflare Worker как proxy для backend запросов:

```javascript
// worker.js на telegram-tickets.tgpythondev.workers.dev
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Проксируем /api/* запросы на backend
    if (url.pathname.startsWith('/api/')) {
      const backendUrl = `https://telegram-bots-backend.onrender.com${url.pathname}${url.search}`;
      
      const backendRequest = new Request(backendUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      
      const response = await fetch(backendRequest);
      
      // Копируем response с сохранением cookies
      const newResponse = new Response(response.body, response);
      
      return newResponse;
    }
    
    // Для остальных запросов возвращаем статические файлы
    return env.ASSETS.fetch(request);
  }
};
```

**Преимущества:**
- Все запросы идут к одному домену (same-origin)
- Cookies работают без ограничений
- Нет проблем с CORS

**Вариант Б: Subdomain для backend**

Разместить backend на `api.telegram-tickets.tgpythondev.workers.dev`:

1. В Cloudflare DNS добавить CNAME запись:
   ```
   api.telegram-tickets.tgpythondev.workers.dev -> telegram-bots-backend.onrender.com
   ```

2. В `frontend/api.js` изменить:
   ```javascript
   const API_URL = window.location.hostname === 'localhost'
       ? 'http://localhost:3000/api'
       : 'https://api.telegram-tickets.tgpythondev.workers.dev/api';
   ```

3. На Render.com в `FRONTEND_URL` указать:
   ```
   FRONTEND_URL=https://telegram-tickets.tgpythondev.workers.dev
   ```

**Преимущества:**
- Same-site cookies (тот же домен верхнего уровня)
- Более надёжно чем cross-origin

---

### 🔧 Решение 2: Хранить refresh token в localStorage (НЕ РЕКОМЕНДУЕТСЯ)

Изменить подход: хранить refresh token в localStorage вместо HttpOnly cookie.

**⚠️ ПРЕДУПРЕЖДЕНИЕ**: Это снижает безопасность - токены доступны для XSS атак.

**Изменения в backend** (`auth.controller.js`):

```javascript
// Вместо установки cookie
res.json({
    user: { ... },
    accessToken,
    refreshToken  // Отправляем refresh token в JSON
});
```

**Изменения в frontend** (`api.js`):

```javascript
// При login/register
localStorage.setItem('refreshToken', data.refreshToken);

// В refreshAccessToken()
const refreshToken = localStorage.getItem('refreshToken');
const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
});
```

---

### 🧪 Решение 3: Проверить настройки браузера пользователя

Попросить пользователя:

1. **Chrome/Edge**: Зайти в `chrome://settings/cookies`
   - Включить "Allow all cookies"
   - Или добавить `telegram-bots-backend.onrender.com` в исключения

2. **Firefox**: Зайти в `about:preferences#privacy`
   - Установить "Standard" вместо "Strict"

3. **Открыть DevTools → Application → Cookies**
   - Проверить, устанавливается ли `refreshToken` cookie после login
   - Проверить, отправляется ли cookie при запросе `/auth/refresh` (вкладка Network → Headers)

---

## Текущий статус деплоя

✅ Код исправлен локально:
- `sameSite: 'none'` в production
- Убран сброс CSRF токена
- Добавлено логирование

✅ Изменения закоммичены в git

✅ Изменения запушены в origin/main

⏳ **Ожидается автоматический деплой на Render.com** (обычно 2-5 минут)

## Проверка после деплоя

1. Зайти в Render.com Dashboard → ваш backend сервис → Logs

2. Подождать строку:
   ```
   Server started on port 10000
   ✅ Все переменные окружения проверены
   ```

3. Попробовать login на `https://telegram-tickets.tgpythondev.workers.dev`

4. В DevTools → Network проверить:
   - POST `/api/auth/login` → Response Headers → `Set-Cookie`
   - POST `/api/auth/refresh` → Request Headers → `Cookie`

5. Если `Cookie` header **отсутствует** в запросе к `/auth/refresh` - браузер блокирует third-party cookies. Нужно использовать **Решение 1**.

## Рекомендация

**Использовать Решение 1, Вариант А** (Cloudflare Worker reverse proxy):
- Самое безопасное
- Не требует изменения кода backend/frontend
- Работает во всех браузерах
- Нет проблем с cookies

Если нужна помощь с настройкой Cloudflare Worker, я могу создать готовый конфигурационный файл.
