// Rate limiting для телеграм бота

const rateLimitMap = new Map();

const LIMITS = {
    command: { max: 10, window: 60000 },    // 10 команд в минуту
    callback: { max: 20, window: 60000 },   // 20 callbacks в минуту
    message: { max: 30, window: 60000 },    // 30 сообщений в минуту
    login: { max: 5, window: 60000 }        // 5 попыток входа в минуту
};

function checkRateLimit(chatId, type = 'command') {
    const key = `${chatId}:${type}`;
    const now = Date.now();
    const limit = LIMITS[type];

    if (!rateLimitMap.has(key)) {
        rateLimitMap.set(key, { count: 1, resetAt: now + limit.window });
        return { allowed: true };
    }

    const data = rateLimitMap.get(key);

    if (now > data.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + limit.window });
        return { allowed: true };
    }

    if (data.count >= limit.max) {
        return {
            allowed: false,
            retryAfter: Math.ceil((data.resetAt - now) / 1000)
        };
    }

    data.count++;
    return { allowed: true };
}

// Очистка старых записей каждые 5 минут
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitMap.entries()) {
        if (now > data.resetAt + 60000) {
            rateLimitMap.delete(key);
        }
    }
}, 5 * 60 * 1000);

module.exports = { checkRateLimit };
