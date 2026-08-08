@echo off
cd /d "%~dp0"

echo Starting local server...
echo.

REM Try Python 3 first
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Server running at: http://localhost:8000
    echo Press Ctrl+C to stop.
    start "" "http://localhost:8000"
    python -m http.server 8000
    goto end
)

REM Try Python 3 explicitly
python3 --version >nul 2>&1
if %errorlevel% == 0 (
    echo Server running at: http://localhost:8000
    echo Press Ctrl+C to stop.
    start "" "http://localhost:8000"
    python3 -m http.server 8000
    goto end
)

REM Try Node.js npx serve
npx --version >nul 2>&1
if %errorlevel% == 0 (
    echo Server running at: http://localhost:8000
    echo Press Ctrl+C to stop.
    start "" "http://localhost:8000"
    npx serve -p 8000 .
    goto end
)

echo ERROR: Python or Node.js not found.
echo Please install Python (https://python.org) or Node.js (https://nodejs.org)
pause

:end
