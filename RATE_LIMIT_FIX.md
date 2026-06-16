# Исправление Rate Limiting и ошибок

## Что было исправлено:

### 1. ✅ Rate Limiting изменен с 15 минут на 20 секунд

**Файл:** `backend/server.js`

**Было:**
```javascript
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100,
    message: { error: 'Слишком много запросов, попробуйте позже' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5,
    message: { error: 'Слишком много попыток входа, попробуйте через 15 минут' }
});
```

**Стало:**
```javascript
const generalLimiter = rateLimit({
    windowMs: 20 * 1000, // 20 секунд
    max: 100,
    message: { error: 'Слишком много запросов, попробуйте через 20 секунд' }
});

const authLimiter = rateLimit({
    windowMs: 20 * 1000, // 20 секунд
    max: 10,
    message: { error: 'Слишком много попыток входа, попробуйте через 20 секунд' }
});
```

---

## Ошибки из консоли:

### ❌ HTTP 429 - "Слишком много попыток входа, попробуйте через 15 минут"
**Статус:** ✅ ИСПРАВЛЕНО
**Причина:** Rate limiting был слишком строгий (15 минут)
**Решение:** Изменено на 20 секунд, лимит увеличен с 5 до 10 попыток

### ❌ HTTP 403 на `/api/auth/refresh`
**Статус:** ⚠️ ТРЕБУЕТ ПРОВЕРКИ
**Возможные причины:**
1. Отсутствует refresh token в cookie
2. Refresh token истек
3. CSRF middleware блокирует (но refresh должен быть БЕЗ CSRF)

**Проверка в коде:**
`backend/routes/auth.routes.js` строка 17 - refresh должен быть БЕЗ csrfProtection ✅

### ❌ "Ошибка подключения к серверу"
**Статус:** ⚠️ ПРОВЕРИТЬ
**Возможные причины:**
1. Render.com backend "спит" (Free Tier) - требует ~30 сек на пробуждение
2. CORS проблема
3. Неправильный API_URL в frontend

---

## Что нужно сделать:

### 1. Задеплоить изменения на Render.com

```bash
cd C:\Users\admin\Desktop\Telegram-Bots.pl
git add backend/server.js
git commit -m "fix: change rate limiting from 15min to 20sec"
git push origin main
```

Render.com автоматически задеплоит (или Manual Deploy в дашборде).

### 2. Очистить cookies в браузере

После деплоя:
1. Открыть DevTools (F12)
2. Application → Cookies
3. Удалить все cookies для `telegram-tickets.tgpythondev.workers.dev` и `telegram-bots-backend.onrender.com`
4. Перезагрузить страницу

### 3. Подождать пробуждения Render.com

Первый запрос после "сна":
- Может занять 30-50 секунд
- Показывает "Ошибка подключения к серверу"
- Просто подождать и повторить

---

## Проверка после деплоя:

### Тест 1: Rate limiting
```bash
# Отправить несколько запросов подряд
for i in {1..12}; do
  curl -X POST https://telegram-bots-backend.onrender.com/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"test'$i'","password":"Test1234"}' \
    -w "\nStatus: %{http_code}\n"
  sleep 1
done
```

**Ожидается:**
- Первые 10 запросов: HTTP 201 или 400 (валидация)
- 11-й и далее: HTTP 429 "попробуйте через 20 секунд"
- Через 20 секунд: снова работает

### Тест 2: Регистрация через UI
1. Открыть https://telegram-tickets.tgpythondev.workers.dev/auth.html
2. Попробовать зарегистрироваться
3. Должно работать (HTTP 201)

### Тест 3: Логи Render.com
1. https://dashboard.render.com
2. Backend service → Logs
3. Не должно быть ошибок PostgreSQL

---

## Итог:

✅ Rate limiting изменен на 20 секунд  
✅ Увеличено количество попыток с 5 до 10  
⏳ Нужен деплой на Render.com  
⏳ Нужна очистка cookies в браузере

---

**Дата:** 2026-06-17  
**Файлы изменены:** `backend/server.js`
