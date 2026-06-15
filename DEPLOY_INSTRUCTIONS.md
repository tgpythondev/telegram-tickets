# Инструкция по деплою проекта Telegram-Bots.pl

## Обзор изменений

В проект добавлена система конфигурации заказа ботов, которая включает:
- Новую страницу конфигуратора (`configurator.html`)
- Многошаговую форму выбора пакета, языка, хостинга и приоритета
- Поддержку сохранения конфигурации заказа в базе данных (JSONB поле)
- Обновленную главную страницу с кнопками перехода к конфигуратору

## Шаг 1: Миграция базы данных (Neon.tech)

### 1.1 Подключение к базе данных

1. Зайдите на [neon.tech](https://neon.tech)
2. Откройте ваш проект Telegram-Bots
3. Перейдите в раздел "SQL Editor" или используйте psql клиент для подключения

### 1.2 Выполнение миграции

Выполните SQL из файла `database/migrations/add_order_config.sql`:

```sql
-- Migration: Add order_config field to tickets table
-- Date: 2026-06-15
-- Description: Adds JSONB field to store order configuration data

-- Add order_config column
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS order_config JSONB;

-- Add index for better query performance on order_config
CREATE INDEX IF NOT EXISTS idx_tickets_order_config ON tickets USING GIN (order_config);

-- Add comment
COMMENT ON COLUMN tickets.order_config IS 'JSON configuration for bot orders including package, language, hosting, priority details';
```

### 1.3 Проверка миграции

Проверьте что колонка добавлена:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tickets' AND column_name = 'order_config';
```

Ожидаемый результат:
```
column_name   | data_type | is_nullable
order_config  | jsonb     | YES
```

## Шаг 2: Деплой Backend (Render.com)

### 2.1 Подготовка файлов

Убедитесь, что следующие файлы обновлены на вашем локальном репозитории:
- `backend/models/db.js` - добавлен параметр `orderConfig`
- `backend/controllers/tickets.controller.js` - обработка конфигурации и форматирование сообщения

### 2.2 Коммит и push изменений

```bash
cd C:\Users\admin\Desktop\Telegram-Bots.pl

# Проверяем изменения
git status

# Добавляем все файлы
git add .

# Коммитим изменения
git commit -m "Add order configurator system with JSONB support"

# Пушим в репозиторий (если используется Git)
git push origin main
```

### 2.3 Деплой на Render

1. Зайдите на [render.com](https://render.com)
2. Откройте ваш сервис `telegram-bots-backend`
3. Render автоматически обнаружит изменения и начнет деплой
4. Дождитесь завершения деплоя (обычно 2-3 минуты)
5. Проверьте логи на наличие ошибок

### 2.4 Проверка backend

Проверьте что backend работает:

```bash
# Проверка health endpoint
curl https://telegram-bots-backend.onrender.com/

# Или откройте в браузере
https://telegram-bots-backend.onrender.com/
```

Ожидаемый ответ: `{"status":"ok","message":"Telegram Bots Backend API"}`

## Шаг 3: Деплой Frontend (Cloudflare Pages)

### 3.1 Подготовка файлов

Убедитесь, что следующие файлы добавлены/обновлены:
- `frontend/configurator.html` - новая страница конфигуратора
- `frontend/configurator.css` - стили конфигуратора
- `frontend/configurator.js` - логика конфигуратора
- `frontend/index.html` - обновленные кнопки
- `frontend/api.js` - поддержка `orderConfig` параметра

### 3.2 Деплой через Cloudflare Pages

#### Вариант А: Через Git (рекомендуется)

1. Закоммитьте и запуште изменения frontend (если еще не сделали):
```bash
git add frontend/
git commit -m "Add configurator frontend"
git push origin main
```

2. Cloudflare Pages автоматически обнаружит изменения и задеплоит их
3. Перейдите на [dash.cloudflare.com](https://dash.cloudflare.com)
4. Откройте ваш проект `telegram-tickets`
5. Перейдите в "Deployments" и дождитесь завершения деплоя

#### Вариант Б: Через Direct Upload

Если Git не настроен:

1. Зайдите на [dash.cloudflare.com](https://dash.cloudflare.com)
2. Откройте проект `telegram-tickets`
3. Перейдите в "Deployments"
4. Нажмите "Create deployment" > "Direct Upload"
5. Загрузите все файлы из папки `frontend/`:
   - configurator.html
   - configurator.css
   - configurator.js
   - index.html (обновленный)
   - api.js (обновленный)
   - все остальные файлы

### 3.3 Проверка frontend

Откройте сайт в браузере:

```
https://telegram-tickets.tgpythondev.workers.dev
```

Проверьте:
1. ✅ Главная страница загружается
2. ✅ Кнопка "Перейти к конфигурации" ведет на `configurator.html`
3. ✅ Конфигуратор открывается без ошибок
4. ✅ Можно пройти все шаги конфигурации

## Шаг 4: Тестирование системы

### 4.1 Тест без авторизации

1. Откройте `https://telegram-tickets.tgpythondev.workers.dev`
2. Нажмите "Перейти к конфигурации"
3. Пройдите все шаги конфигуратора
4. Нажмите "Отправить заказ"
5. **Ожидаемое поведение**: Редирект на страницу авторизации

### 4.2 Тест с авторизацией

1. Авторизуйтесь на сайте (или зарегистрируйтесь)
2. Перейдите к конфигуратору
3. Заполните все шаги:
   - Выберите пакет (например, Standard)
   - Краткое описание: "Тестовый бот для заказов"
   - Подробное описание: "Нужен бот для приема заказов в ресторане с меню, корзиной и оплатой"
   - Язык: Python
   - Хостинг: Платный
   - Приоритет: Нормальный
4. Проверьте итоговую стоимость (должна быть $30)
5. Нажмите "Отправить заказ"
6. **Ожидаемое поведение**: Редирект на страницу тикетов

### 4.3 Проверка созданного тикета

1. На странице тикетов найдите созданный тикет
2. Откройте его
3. Проверьте что:
   - Тема: "Заказ бота: Standard"
   - Сообщение содержит красиво отформатированную конфигурацию с эмодзи
   - Все параметры корректно отображены

### 4.4 Проверка в админ панели

1. Войдите как администратор
2. Откройте админ панель: `https://telegram-tickets.tgpythondev.workers.dev/admin/dashboard.html`
3. Найдите созданный тикет
4. Проверьте что конфигурация отображается корректно

### 4.5 Проверка в базе данных

Выполните запрос в Neon.tech SQL Editor:

```sql
SELECT id, subject, order_config
FROM tickets
WHERE order_config IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;
```

Проверьте что `order_config` содержит JSON с правильными данными:

```json
{
  "package": "Standard",
  "shortDescription": "Тестовый бот для заказов",
  "detailedDescription": "Нужен бот для приема заказов...",
  "language": "Python",
  "hosting": {
    "type": "paid",
    "extraStorage": 0,
    "extraBandwidth": 0
  },
  "priority": "normal",
  "totalPrice": 30
}
```

## Шаг 5: Проверка Telegram бота (опционально)

Если Telegram бот активен:

1. Создайте тикет через конфигуратор
2. Проверьте что администраторы получили уведомление в Telegram
3. Уведомление должно содержать отформатированную информацию о заказе

## Возможные проблемы и решения

### Проблема 1: Backend не запускается после деплоя

**Причина**: Ошибка в SQL запросе или синтаксисе

**Решение**:
1. Проверьте логи на Render.com
2. Убедитесь что миграция выполнена в БД
3. Проверьте что `order_config` колонка существует

### Проблема 2: Ошибка при создании тикета

**Причина**: Backend не может сохранить JSONB

**Решение**:
```sql
-- Проверьте что колонка существует
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tickets' AND column_name = 'order_config';

-- Если нет, выполните миграцию
ALTER TABLE tickets ADD COLUMN order_config JSONB;
```

### Проблема 3: Конфигуратор не открывается

**Причина**: Файлы не загружены на Cloudflare Pages

**Решение**:
1. Проверьте что файлы `configurator.html`, `configurator.css`, `configurator.js` загружены
2. Проверьте Cloudflare Pages deployment logs
3. Убедитесь что в `index.html` правильные ссылки на `configurator.html`

### Проблема 4: Цена не рассчитывается

**Причина**: JavaScript ошибка в `configurator.js`

**Решение**:
1. Откройте DevTools в браузере (F12)
2. Перейдите в Console
3. Проверьте наличие ошибок
4. Убедитесь что `configurator.js` загружается корректно

### Проблема 5: После авторизации не возвращается к конфигуратору

**Причина**: SessionStorage не сохраняет данные или редирект не работает

**Решение**:
1. Проверьте что в `auth.html` есть параметр `?redirect=configurator`
2. После входа должен быть редирект обратно на `configurator.html`
3. Конфигурация должна восстановиться из sessionStorage

## Мониторинг и поддержка

### Логи Backend (Render.com)

```
https://dashboard.render.com/web/[your-service-id]/logs
```

Следите за:
- Ошибками создания тикетов
- SQL ошибками
- API errors

### Логи Frontend (Cloudflare Pages)

```
https://dash.cloudflare.com/[account-id]/pages/view/telegram-tickets/deployments
```

Следите за:
- Deployment errors
- Build errors (если используется сборка)

### База данных (Neon.tech)

Полезные запросы для мониторинга:

```sql
-- Количество заказов через конфигуратор
SELECT COUNT(*) FROM tickets WHERE order_config IS NOT NULL;

-- Популярные пакеты
SELECT 
    order_config->>'package' as package,
    COUNT(*) as count
FROM tickets
WHERE order_config IS NOT NULL
GROUP BY order_config->>'package'
ORDER BY count DESC;

-- Средняя стоимость заказов
SELECT 
    AVG((order_config->>'totalPrice')::numeric) as avg_price
FROM tickets
WHERE order_config IS NOT NULL;

-- Популярные языки программирования
SELECT 
    order_config->>'language' as language,
    COUNT(*) as count
FROM tickets
WHERE order_config IS NOT NULL
GROUP BY order_config->>'language'
ORDER BY count DESC;
```

## Бэкап и откат

### Создание бэкапа БД перед миграцией

```sql
-- Бэкап структуры таблицы tickets
CREATE TABLE tickets_backup AS SELECT * FROM tickets;
```

### Откат миграции (если что-то пошло не так)

```sql
-- Удаление колонки order_config
ALTER TABLE tickets DROP COLUMN IF EXISTS order_config;

-- Восстановление из бэкапа
DROP TABLE tickets;
CREATE TABLE tickets AS SELECT * FROM tickets_backup;
```

## Контакты для поддержки

- **Frontend (Cloudflare Pages)**: https://telegram-tickets.tgpythondev.workers.dev
- **Backend (Render)**: https://telegram-bots-backend.onrender.com
- **Database (Neon)**: https://neon.tech
- **Telegram Bot**: @[ваш_бот]

## Чеклист успешного деплоя

- [ ] Миграция БД выполнена (order_config колонка создана)
- [ ] Backend задеплоен на Render без ошибок
- [ ] Frontend задеплоен на Cloudflare Pages
- [ ] Главная страница открывается, кнопки работают
- [ ] Конфигуратор открывается и работает
- [ ] Можно пройти все шаги конфигурации
- [ ] Цена рассчитывается корректно
- [ ] Редирект на авторизацию работает
- [ ] После авторизации можно создать тикет
- [ ] Тикет создается с корректной конфигурацией
- [ ] Конфигурация отображается в тикете
- [ ] Админ панель показывает конфигурацию
- [ ] Telegram уведомления работают (если настроены)

---

**Дата создания инструкции**: 2026-06-15
**Версия проекта**: 2.0 (с системой конфигуратора)
