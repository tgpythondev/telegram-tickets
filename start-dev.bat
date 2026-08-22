@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo   KALIANG dev-режим
echo   Backend :3000 (тестовый, БД в памяти)
echo   Frontend: http://localhost:8000
echo ==============================================
echo.

REM ── Переменные для тестового бэкенда ──────────────────────
REM DB_MODE=memory включает pg-mem (PostgreSQL не нужен)
set DB_MODE=memory
set NODE_ENV=development
set PORT=3000
set JWT_ACCESS_SECRET=dev-access-secret-0123456789abcdef0123456789abcdef
set JWT_REFRESH_SECRET=dev-refresh-secret-0123456789abcdef0123456789abcdef
set FRONTEND_URL=http://localhost:8000
set APP_URL=http://localhost:8000
set BACKEND_URL=http://localhost:3000
REM Юзер, которому при регистрации автоматически выдаётся админка
REM (пусто = только встроенный admin/Admin123!)
set ADMIN_USERNAME=

REM ── 1. Backend в отдельном окне ───────────────────────────
echo [1/2] Запуск backend (in-memory DB)...
start "KALIANG API [memory-db]" /D "%~dp0backend" cmd /k node server.js

REM Даём бэкенду время подняться
timeout /t 2 /nobreak >nul

REM ── 2. Frontend: статический сервер + браузер ─────────────
echo [2/2] Запуск frontend на http://localhost:8000 ...
echo.
echo Тестовые логины:  admin / Admin123!   и   demo / Demo123!
echo Закрытие окна остановит frontend. Окно backend закрывается отдельно.
start "" "http://localhost:8000"

cd /d "%~dp0frontend"

python --version >nul 2>&1
if %errorlevel% == 0 (
    python -m http.server 8000
    goto end
)

python3 --version >nul 2>&1
if %errorlevel% == 0 (
    python3 -m http.server 8000
    goto end
)

npx --version >nul 2>&1
if %errorlevel% == 0 (
    npx serve -p 8000 .
    goto end
)

echo ERROR: Python or Node.js not found.
echo Please install Python (https://python.org) or Node.js (https://nodejs.org)
pause

:end
