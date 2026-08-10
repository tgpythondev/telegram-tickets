#!/bin/bash
# Build script для Render.com
# Устанавливает зависимости Node.js и Python

set -e  # прерывать при любой ошибке

echo "=== Установка Node.js зависимостей (backend) ==="
npm install

echo "=== Установка Node.js зависимостей (discord-bot) ==="
npm install --prefix discord-bot

echo "=== Установка Python зависимостей для TG-бота ==="
# pip3 или pip — пробуем оба варианта
# --user нужен на Render где нет прав на системный site-packages
# PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1 — разрешает сборку Rust-расширений
# на Python версиях новее чем поддерживает pyo3 (актуально для Python 3.14+)
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1
if command -v pip3 &> /dev/null; then
    pip3 install --user -r tg-bot/requirements.txt
elif command -v pip &> /dev/null; then
    pip install --user -r tg-bot/requirements.txt
else
    echo "WARNING: pip не найден, TG-бот не будет работать"
fi

echo "=== Build завершён ==="
