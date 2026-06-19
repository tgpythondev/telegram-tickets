# Руководство по настройке Cloudflare Worker

## Что это решает

Cloudflare Worker будет проксировать все `/api/*` запросы с вашего фронтенда на backend. Это делает запросы **same-origin**, что решает проблему с third-party cookies.

## Шаги настройки

### 1. Создать Cloudflare Worker

**Способ А: Через Cloudflare Dashboard (проще)**

1. Зайдите на https://dash.cloudflare.com
2. Выберите ваш аккаунт
3. Перейдите в **Workers & Pages** → **Create Application** → **Create Worker**
4. Назовите worker, например: `telegram-tickets-proxy`
5. Нажмите **Deploy**
6. Нажмите **Edit Code**
7. Замените весь код содержимым файла `cloudflare-worker.js` из этого репозитория
8. Нажмите **Save and Deploy**

**Способ Б: Через Wrangler CLI**

```bash
npm install -g wrangler
wrangler login
cd C:\Users\admin\Desktop\Telegram-Bots.pl
wrangler deploy cloudflare-worker.js --name telegram-tickets-proxy
```

### 2. Настроить Cloudflare Pages для фронтенда

1. Зайдите в **Workers & Pages** → **Create Application** → **Pages**
2. Подключите GitHub репозиторий
3. Настройки сборки:
   - **Framework preset**: None
   - **Build command**: (пусто)
   - **Build output directory**: `frontend`
4. В **Advanced settings** добавьте Service Binding:
   - **Variable name**: `ASSETS`
   - **Service**: выберите созданный worker `telegram-tickets-proxy`

### 3. Настроить Custom Domain

1. В настройках Pages проекта перейдите в **Custom domains**
2. Добавьте домен: `telegram-tickets.tgpythondev.workers.dev`
3. Cloudflare автоматически настроит DNS

### 4. Обновить frontend код

Замените файл `frontend/api.js` на `frontend/api-same-origin.js`:

```bash
cd C:\Users\admin\Desktop\Telegram-Bots.pl
cp frontend/api-same-origin.js frontend/api.js
git add frontend/api.js
git commit -m "Update API to use same-origin requests via Cloudflare Worker proxy"
git push origin main
```

Cloudflare Pages автоматически задеплоит изменения.

### 5. Обновить backend настройки на Render.com

На Render.com в настройках backend сервиса измените environment variable:

```
FRONTEND_URL=https://telegram-tickets.tgpythondev.workers.dev
```

Backend перезапустится автоматически.

### 6. Удалить ненужные файлы (опционально)

Если всё работает, можно удалить тестовые скрипты:

```bash
rm backend/test-refresh.js
rm backend/test-auth-flow.js
rm cloudflare-worker.js
rm frontend/api-same-origin.js
```

## Альтернативный вариант: Простая настройка без Pages

Если фронтенд уже работает на `telegram-tickets.tgpythondev.workers.dev`, можно:

1. Создать второй worker с именем `telegram-tickets-api`
2. Настроить route в Cloudflare:
   - Pattern: `telegram-tickets.tgpythondev.workers.dev/api/*`
   - Worker: `telegram-tickets-api`

Это будет проксировать только `/api/*` запросы, оставив остальное без изменений.

## Проверка работы

### 1. Откройте DevTools на `https://telegram-tickets.tgpythondev.workers.dev`

### 2. Выполните login

### 3. Проверьте Network tab:

- ✅ Запрос к `/api/auth/login` (без полного URL - same-origin)
- ✅ Response Status: 200
- ✅ Set-Cookie: `refreshToken=...` присутствует
- ✅ Cookie флаги: `HttpOnly; Secure; SameSite=Lax` (можно использовать Lax для same-origin!)

### 4. Подождите 15+ минут или сделайте любой authenticated запрос

- ✅ Автоматический запрос к `/api/auth/refresh`
- ✅ Request Headers содержат `Cookie: refreshToken=...`
- ✅ Response Status: 200 с новым `accessToken`
- ✅ **НЕТ** ошибки 403!

## Преимущества этого решения

1. **Same-origin requests** - браузер не блокирует cookies
2. **Безопасно** - HttpOnly cookies защищены от XSS
3. **Нет изменений в backend** - всё остается как есть
4. **Простая миграция** - меняется только один файл на фронтенде
5. **Работает во всех браузерах** - нет проблем с tracking protection

## Откат при проблемах

Если что-то пошло не так:

1. В Cloudflare Worker Dashboard нажмите **Rollback** к предыдущей версии
2. Или верните старый `api.js`:
   ```bash
   git revert HEAD
   git push origin main
   ```

## Нужна помощь?

Если возникли вопросы по настройке Cloudflare Worker, проверьте:

1. Worker Logs в Cloudflare Dashboard
2. Render.com Logs для backend
3. Browser DevTools Console для ошибок

Логи покажут точную причину проблемы.
