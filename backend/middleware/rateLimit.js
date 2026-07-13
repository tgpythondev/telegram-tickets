const rateLimit = require('express-rate-limit');

// Per-user rate limiter factory using express-rate-limit.
// keyGenerator uses req.user.id so limits are per-authenticated-user, not per-IP.
// Falls back to IP if user is not yet set (shouldn't happen on protected routes).
//
// ⚠️  SINGLE-INSTANCE LIMITATION: express-rate-limit uses in-memory store by default.
//     If deployed with multiple instances (e.g. Render auto-scaling), each instance
//     counts independently — a user can exceed the limit N×max times across N instances.
//     For multi-instance production, replace with a Redis store:
//       npm install rate-limit-redis ioredis
//       store: new RedisStore({ client: redisClient })
function createUserRateLimiter({ windowMs, max, message }) {
    return rateLimit({
        windowMs,
        max,
        // express-rate-limit v6+ supports async keyGenerator
        keyGenerator: (req) => {
            return req.user?.id ? `user:${req.user.id}` : req.ip;
        },
        message: { error: message },
        standardHeaders: true,
        legacyHeaders: false,
        // Skip successful requests? No — count all attempts
        skipSuccessfulRequests: false
    });
}

const ticketRateLimit = createUserRateLimiter({
    windowMs: 60 * 1000,   // 1 minute
    max: 1,                 // 1 ticket per minute per user
    message: 'Подождите минуту перед созданием следующего тикета'
});

const messageRateLimit = createUserRateLimiter({
    windowMs: 15 * 1000,   // 15 seconds
    max: 1,                 // 1 message per 15 seconds per user
    message: 'Подождите 15 секунд перед отправкой следующего сообщения'
});

const configSubmitRateLimit = createUserRateLimiter({
    windowMs: 60 * 1000,
    max: 1,
    message: 'Подождите минуту перед повторной отправкой заказа'
});

module.exports = {
    ticketRateLimit,
    messageRateLimit,
    configSubmitRateLimit
};
