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

    // Для запросов с Authorization header проверяем токен через auth middleware
    // Если req.user существует, значит токен уже проверен - пропускаем CSRF
    if (req.user) {
        return next();
    }

    const token = req.headers['x-csrf-token'];

    if (!token) {
        return res.status(403).json({ error: 'CSRF token missing' });
    }

    // Проверяем токен в хранилище
    if (tokenStore.has(token)) {
        // Опционально: одноразовые токены (удаляем после использования)
        tokenStore.delete(token);
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
