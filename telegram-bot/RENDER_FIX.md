# 🤖 Исправление: Telegram Bot на Render.com

## Проблема
Render.com free tier предоставляет только **один внешний порт** на сервис. Бот пытался запуститься на порту 5000 в режиме Webhook, но запросы от Telegram не доходили.

## ✅ Решение: Long Polling

Long Polling - бот сам опрашивает Telegram API, не нужен внешний порт для входящих webhook запросов.

---

## 🔧 Настройка на Render.com

### Вариант 1: Отдельный сервис для бота (рекомендуется)

1. **Создайте новый Web Service на Render**
   - Name: `telegram-bots-bot`
   - Repository: ваш GitHub репозиторий
   - Branch: `main`
   - Root Directory: `telegram-bot`
   - Build Command: `npm install`
   - Start Command: `node bot.js`

2. **Добавьте переменные окружения:**
   ```env
   NODE_ENV=production
   BOT_MODE=polling
   TELEGRAM_BOT_TOKEN=ваш_токен_от_botfather
   BACKEND_API_URL=https://telegram-bots-backend.onrender.com/api
   ```

3. **Deploy** - Render запустит бота в режиме Long Polling

---

### Вариант 2: Запуск бота вместе с backend (экономия)

Если хотите запустить бота в том же процессе что и backend:

1. **Обновите `backend/package.json`:**
   ```json
   {
     "scripts": {
       "start": "node server.js & node ../telegram-bot/bot.js"
     }
   }
   ```

2. **Добавьте переменные бота в backend environment на Render:**
   ```env
   BOT_MODE=polling
   TELEGRAM_BOT_TOKEN=ваш_токен
   ```

3. **Redeploy backend**

⚠️ **Важно:** При этом варианте бот и backend будут перезапускаться вместе.

---

## 📋 Переменные окружения для бота

### Обязательные:
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
BACKEND_API_URL=https://telegram-bots-backend.onrender.com/api
BOT_MODE=polling
NODE_ENV=production
```

### Опциональные (не нужны для polling):
```env
WEBHOOK_URL=https://...
PORT=3000
```

---

## 🚀 Деплой изменений

```bash
# Закоммитьте изменения
git add telegram-bot/bot.js telegram-bot/.env.example
git commit -m "Fix: Switch bot to long polling mode for Render"
git push

# Render автоматически задеплоит
```

---

## ✅ Проверка работы

### 1. Проверьте логи на Render
```
🤖 Telegram бот запущен...
Режим: Long Polling
Окружение: Production
```

### 2. Протестируйте бота
1. Найдите бота в Telegram
2. Напишите `/start`
3. Бот должен ответить

### 3. Проверьте интеграцию
1. Войдите в бота: `/login username password`
2. Создайте тикет через бота
3. Проверьте что тикет появился на сайте

---

## 🐛 Troubleshooting

### Бот не отвечает
**Проверьте логи на Render:**
- Ищите ошибки подключения
- Убедитесь что `TELEGRAM_BOT_TOKEN` правильный

### "Conflict: terminated by other getUpdates"
**Проблема:** Webhook еще активен или бот запущен в двух местах

**Решение:**
```bash
# Сбросьте webhook через Telegram API
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook"

# Или через браузер:
# https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook
```

### Backend недоступен из бота
**Проверьте:** `BACKEND_API_URL` должен быть полный URL:
```
✅ https://telegram-bots-backend.onrender.com/api
❌ http://localhost:3000/api
❌ /api
```

---

## 📊 Long Polling vs Webhook

| Параметр | Long Polling | Webhook |
|----------|--------------|---------|
| Внешний порт | ❌ Не нужен | ✅ Нужен |
| SSL сертификат | ❌ Не нужен | ✅ Нужен |
| Подходит для Render free | ✅ Да | ❌ Нет |
| Latency | ~1-2 сек | ~100ms |
| Нагрузка на Telegram | Средняя | Низкая |

**Вывод:** Для Render free tier используйте **Long Polling** (BOT_MODE=polling)

---

## 🎯 Итого

После этих изменений:
1. ✅ Бот работает в режиме Long Polling
2. ✅ Не нужен внешний порт 5000
3. ✅ Совместим с Render.com free tier
4. ✅ Можно запустить отдельно или вместе с backend

---

**Дата:** 2026-06-14  
**Статус:** Исправлено ✅
