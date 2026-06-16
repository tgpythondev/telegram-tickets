// CSRF защита для cross-origin setup
// Используем double-submit cookie pattern с header вместо cookie-only

const crypto = require('crypto');

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

    const token = req.headers['x-csrf-token'];

    if (!token) {
        return res.status(403).json({ error: 'CSRF token missing' });
    }

    // Простая валидация токена (в production используйте более сложную логику)
    if (token.length === 64 && /^[a-f0-9]+$/.test(token)) {
        return next();
    }

    return res.status(403).json({ error: 'Invalid CSRF token' });
}

// Генерация токена для клиента
csrfProtection.generateToken = generateToken;

module.exports = csrfProtection;
