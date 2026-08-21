require('dotenv').config();
// Render не имеет IPv6-egress — принудительно IPv4 для DNS,
// иначе pg не может достучаться до Supabase (ENETUNREACH на IPv6)
require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { startTokenCleanupSchedule } = require('./utils/cleanup');
const { startAll: startChildProcesses, stopAll: stopChildProcesses } = require('./utils/processManager');

// compression — подключаем если установлен, иначе пропускаем без ошибки
let compression;
try { compression = require('compression'); } catch (_) { compression = null; }

// pino-http — подключаем если установлен
let pinoHttp;
try { pinoHttp = require('pino-http'); } catch (_) { pinoHttp = null; }

const authRoutes      = require('./routes/auth.routes');
const oauthRoutes     = require('./routes/oauth.routes');
const ticketsRoutes   = require('./routes/tickets.routes');
const adminRoutes     = require('./routes/admin.routes');
const promoRoutes     = require('./routes/promo.routes');
const portfolioRoutes = require('./routes/portfolio.routes');
const sseAuth         = require('./middleware/sseAuth');
const sseController   = require('./controllers/sse.controller');
const firewall        = require('./firewall');

const app = express();

// Trust proxy для работы за Render.com reverse proxy
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// /ping — самый первый роут, до helmet/CORS/rate-limit/всего
app.get('/ping', (req, res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ ok: true });
});

// Anti-DDoS firewall — подключается сразу после /ping,
// до helmet/CORS/rate-limit, чтобы атакующие запросы
// отсекались как можно раньше.
// trust proxy уже установлен выше, поэтому req.ip корректен.
app.use(firewall);

// Валидация критических переменных окружения при старте
function validateEnvironment() {
    const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Отсутствуют переменные окружения:', missing.join(', '));
        process.exit(1);
    }

    if (process.env.JWT_ACCESS_SECRET.length < 32) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_ACCESS_SECRET должен быть минимум 32 символа');
        process.exit(1);
    }

    if (process.env.JWT_REFRESH_SECRET.length < 32) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_REFRESH_SECRET должен быть минимум 32 символа');
        process.exit(1);
    }

    if (process.env.FRONTEND_URL) {
        try {
            new URL(process.env.FRONTEND_URL);
        } catch (e) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: FRONTEND_URL имеет неверный формат URL');
            process.exit(1);
        }
    }

    console.log('✅ Все переменные окружения проверены');
}

validateEnvironment();

// Запуск очистки токенов — сохраняем handle для остановки при shutdown
const cleanupHandle = startTokenCleanupSchedule(24);

// Rate limiting
// validate: false — отключаем валидацию IPv6-ключей (ERR_ERL_KEY_GEN_IPV6),
// клиенты Render приходят с IPv6-адресами
const generalLimiter = rateLimit({
    windowMs: 20 * 1000,
    max: 100,
    message: { error: 'Слишком много запросов, попробуйте через 20 секунд' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
});

const authLimiter = rateLimit({
    windowMs: 20 * 1000,
    max: 10,
    message: { error: 'Слишком много попыток входа, попробуйте через 20 секунд' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
});

const sseLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Слишком много SSE подключений' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
});

// ── Middleware ────────────────────────────────────────────────────────────────

// Gzip-сжатие ответов (экономит трафик и время передачи)
if (compression) {
    app.use(compression());
}

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://telegram-bots-backend.onrender.com", "https://telegram-bots.pl"],
            fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// HTTP request logging:
// - pino-http (async JSON) если установлен
// - иначе только в dev-режиме через console.log
if (pinoHttp) {
    app.use(pinoHttp({
        level: process.env.LOG_LEVEL || 'warn',
        // Не логируем /ping и /health чтобы не засорять логи
        autoLogging: {
            ignore: (req) => req.url === '/ping' || req.url === '/health'
        }
    }));
} else if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.path}`);
        next();
    });
}

// CORS
const allowedOrigins = [
    process.env.FRONTEND_URL || 'https://telegram-bots.pl',
    'https://telegram-bots.pl',
    'https://www.telegram-bots.pl'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            // Запросы без Origin: браузерные навигации (в т.ч. OAuth-редиректы
            // от Discord/Google/GitHub), health-check Render, server-to-server
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '1mb', strict: true }));
app.use(cookieParser());

app.use((req, res, next) => {
    // SSE endpoint — долгоживущее соединение, обходит короткий general limiter
    if (req.path === '/api/events') return next();
    return generalLimiter(req, res, next);
});

// ── Routes ────────────────────────────────────────────────────────────────────
// OAuth монтируется ДО '/api/auth' с authLimiter — редиректы провайдеров
// не должны попадать под жёсткий лимит попыток входа
app.use('/api/auth/oauth', oauthRoutes);
app.use('/api/auth',      authLimiter, authRoutes);
app.use('/api/tickets',  ticketsRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/promo',    promoRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.get('/api/events',   sseLimiter, sseAuth, sseController.stream);

// Health check с проверкой БД
app.get('/health', async (req, res) => {
    try {
        const { pool } = require('./config/database');
        await pool.query('SELECT 1');
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: 'connected'
        });
    } catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            database: 'disconnected'
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack || err);

    if (process.env.NODE_ENV === 'production') {
        res.status(500).json({ error: 'Internal server error' });
    } else {
        res.status(500).json({
            error: 'Internal server error',
            message: err.message,
            stack: err.stack
        });
    }
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Останавливаем таймер очистки — больше не стреляет на закрытом пуле
    clearInterval(cleanupHandle);

    // Останавливаем дочерние процессы (discord-bot, tg-bot)
    stopChildProcesses();

    const sse = require('./utils/sse');
    sse.closeAll();

    server.close(async () => {
        console.log('HTTP server closed');

        try {
            const { pool } = require('./config/database');
            await pool.end();
            console.log('Database pool closed');
            process.exit(0);
        } catch (err) {
            console.error('Error during shutdown:', err);
            process.exit(1);
        }
    });

    // Принудительное завершение через 10 секунд
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    setTimeout(() => process.exit(1), 1000);
});

// Start server
const server = app.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'https://telegram-bots.pl'}`);
    } else {
        console.log(`Server started on port ${PORT}`);
    }

    // Запускаем дочерние процессы после того как сервер поднялся
    startChildProcesses();
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
