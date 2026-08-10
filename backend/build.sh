#!/bin/bash
# Build script для Render.com

set -e  # прерывать при ошибке Node.js шагов

echo "=== Установка Node.js зависимостей (backend) ==="
npm install

echo "=== Установка Node.js зависимостей (discord-bot) ==="
npm install --prefix discord-bot

# Python секция — не используем set -e, чтобы ошибка pip не ломала весь деплой
set +e

echo "=== Установка Python зависимостей для TG-бота ==="
# Render читает .python-version из корня репозитория — должен использовать 3.12.
# Проверяем версию и создаём изолированный venv в tg-bot/.venv

PYTHON_BIN=""
for bin in python3.12 python3.13 python3 python; do
    if command -v "$bin" &> /dev/null; then
        PYTHON_BIN="$bin"
        echo "Found Python: $PYTHON_BIN ($($PYTHON_BIN --version 2>&1))"
        break
    fi
done

if [ -z "$PYTHON_BIN" ]; then
    echo "WARNING: Python не найден, TG-бот не будет работать"
else
    $PYTHON_BIN -m venv tg-bot/.venv
    tg-bot/.venv/bin/pip install --upgrade pip -q
    if tg-bot/.venv/bin/pip install -r tg-bot/requirements.txt; then
        echo "TG-bot dependencies installed successfully"
    else
        echo "WARNING: Не удалось установить зависимости TG-бота"
        echo "TG-бот не будет запущен"
        # Удаляем неполный venv чтобы processManager не пытался его запустить
        rm -rf tg-bot/.venv
    fi
fi

set -e
echo "=== Build завершён ==="
