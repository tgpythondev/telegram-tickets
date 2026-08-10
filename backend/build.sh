#!/bin/bash
# Build script для Render.com
# Устанавливает зависимости Node.js и Python

set -e  # прерывать при любой ошибке

echo "=== Установка Node.js зависимостей (backend) ==="
npm install

echo "=== Установка Node.js зависимостей (discord-bot) ==="
npm install --prefix discord-bot

echo "=== Установка Python зависимостей для TG-бота ==="
# pydantic-core (зависимость aiogram) не совместим с Python 3.14 —
# PyUnicode_New и другие C API функции удалены в 3.14.
# Создаём изолированный venv на python3.12/3.13 в папке tg-bot/.venv
# и устанавливаем зависимости туда.

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
    # Создаём venv в tg-bot/.venv
    $PYTHON_BIN -m venv tg-bot/.venv
    # Устанавливаем зависимости в этот venv
    tg-bot/.venv/bin/pip install --upgrade pip -q
    tg-bot/.venv/bin/pip install -r tg-bot/requirements.txt
    echo "TG-bot dependencies installed into tg-bot/.venv"
fi

echo "=== Build завершён ==="
