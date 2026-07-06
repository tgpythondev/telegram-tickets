const rateLimitMap = new Map();

const LIMITS = {
    ticket: { max: 1, window: 60000 },       // 1 тикет в минуту
    message: { max: 1, window: 15000 },      // 1 сообщение в 15 секунд
    config_submit: { max: 1, window: 60000 } // 1 отправка в конфигураторе в минуту
};

// Rate limit middleware для Express
function createRateLimiter(type = 'ticket') {
    return (req, res, next) => {
        const userId = req.user?.id;
        if (!userId) {
            return next(); // Если нет пользователя, пропускаем (для анонимных запросов)
        }

        const key = `${userId}:${type}`;
        const now = Date.now();
        const limit = LIMITS[type];

        if (!limit) {
            return next(); // Если тип лимита не найден, пропускаем
        }

        if (!rateLimitMap.has(key)) {
            rateLimitMap.set(key, { count: 1, resetAt: now + limit.window });
            return next();
        }

        const data = rateLimitMap.get(key);

        if (now > data.resetAt) {
            rateLimitMap.set(key, { count: 1, resetAt: now + limit.window });
            return next();
        }

        if (data.count >= limit.max) {
            return res.status(429).json({
                error: 'Слишком много запросов',
                retryAfter: Math.ceil((data.resetAt - now) / 1000)
            });
        }

        data.count++;
        next();
    };
}

// Очистка устаревших записей каждые 5 минут
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitMap.entries()) {
        if (now > data.resetAt + 60000) {
            rateLimitMap.delete(key);
        }
    }
}, 5 * 60 * 1000);

// Очистка при остановке сервера
process.on('SIGTERM', () => {
    rateLimitMap.clear();
});
process.on('SIGINT', () => {
    rateLimitMap.clear();
});

module.exports = {
    createRateLimiter,
    ticketRateLimit: createRateLimiter('ticket'),
    messageRateLimit: createRateLimiter('message'),
    configSubmitRateLimit: createRateLimiter('config_submit')
};
