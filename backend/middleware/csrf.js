// CSRF защита для cross-origin setup
// Используем double-submit cookie pattern с header вместо cookie-only

const crypto = require('crypto');
const { verifyAccessToken } = require('../utils/jwt');

// Хранилище токенов в памяти (для production используйте Redis)
const tokenStore = new Map();

// Генерация CSRF токена
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware для проверки CSRF
function csrfProtection(req, res, next) {
    // Пропускаем GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Проверяем Authorization header (JWT token) - это основная аутентификация
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // Проверяем CSRF токен в header
    const csrfToken = req.headers['x-csrf-token'];

    // Если есть JWT токен - проверяем, что он валиден
    if (token) {
        try {
            verifyAccessToken(token);
            // JWT токен действителен - но всё равно проверяем CSRF для защиты от XSRF
            if (!csrfToken) {
                return res.status(403).json({ error: 'CSRF token missing' });
            }
            if (tokenStore.has(csrfToken)) {
                tokenStore.delete(csrfToken);
                return next();
            }
            return res.status(403).json({ error: 'Invalid CSRF token' });
        } catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    }

    // Если нет JWT токена - проверяем только CSRF
    if (!csrfToken) {
        return res.status(403).json({ error: 'CSRF token missing' });
    }

    if (tokenStore.has(csrfToken)) {
        tokenStore.delete(csrfToken);
        return next();
    }

    return res.status(403).json({ error: 'Invalid CSRF token' });
}

// Генерация токена для клиента
csrfProtection.generateToken = generateToken;

// Очистка старых токенов (предотвращение утечки памяти)
setInterval(() => {
    const now = Date.now();
    const maxAge = 3600000; // 1 час
    for (const [token, data] of tokenStore.entries()) {
        if (now - data.createdAt > maxAge) {
            tokenStore.delete(token);
        }
    }
}, 600000); // Очистка каждые 10 минут

module.exports = csrfProtection;
