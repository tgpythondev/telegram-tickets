@echo off
set DB_MODE=memory
set NODE_ENV=development
set PORT=3000
set JWT_ACCESS_SECRET=dev_access_secret_0123456789abcdef0123456789abcd
set JWT_REFRESH_SECRET=dev_refresh_secret_0123456789abcdef0123456789ab
set FRONTEND_URL=http://localhost:8000
set APP_URL=http://localhost:8000
set BACKEND_URL=http://localhost:3000
cd /d "%~dp0backend"
node server.js
