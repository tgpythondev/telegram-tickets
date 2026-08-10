#!/bin/bash
# Build script для Render.com
# Устанавливает зависимости Node.js и Python

set -e  # прерывать при любой ошибке

echo "=== Установка Node.js зависимостей ==="
npm install

echo "=== Установка Python зависимостей для TG-бота ==="
# pip3 или pip — пробуем оба варианта
if command -v pip3 &> /dev/null; then
    pip3 install -r tg-bot/requirements.txt
elif command -v pip &> /dev/null; then
    pip install -r tg-bot/requirements.txt
else
    echo "WARNING: pip не найден, TG-бот не будет работать"
fi

echo "=== Build завершён ==="
