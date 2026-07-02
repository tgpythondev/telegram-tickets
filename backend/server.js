require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { initTelegramBot } = require('./utils/telegram');
const { startTokenCleanupSchedule } = require('./utils/cleanup');

const authRoutes = require('./routes/auth.routes');
const ticketsRoutes = require('./routes/tickets.routes');
const adminRoutes = require('./routes/admin.routes');
const sseAuth = require('./middleware/sseAuth');
const sseController = require('./controllers/sse.controller');

const app = express();

// Trust proxy для работы за Render.com reverse proxy
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// Валидация критических переменных окружения при старте
function validateEnvironment() {
    const required = [
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET',
        'DATABASE_URL',
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_ADMIN_CHAT_IDS'
    ];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Отсутствуют переменные окружения:', missing.join(', '));
        process.exit(1);
    }

    // Проверка минимальной длины JWT секретов
    if (process.env.JWT_ACCESS_SECRET.length < 32) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_ACCESS_SECRET должен быть минимум 32 символа');
        process.exit(1);
    }

    if (process.env.JWT_REFRESH_SECRET.length < 32) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_REFRESH_SECRET должен быть минимум 32 символа');
        process.exit(1);
    }

    // Валидация FRONTEND_URL
    if (process.env.FRONTEND_URL) {
        try {
            new URL(process.env.FRONTEND_URL);
        } catch (e) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: FRONTEND_URL имеет неверный формат URL');
            process.exit(1);
        }
    }

    // Валидация TELEGRAM_BOT_TOKEN формата
    if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(process.env.TELEGRAM_BOT_TOKEN)) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_BOT_TOKEN имеет некорректный формат');
        process.exit(1);
    }

    console.log('✅ Все переменные окружения проверены');
}

validateEnvironment();

// Инициализация Telegram бота
initTelegramBot();

// Запуск периодической очистки истёкших refresh токенов (каждые 24 часа)
startTokenCleanupSchedule(24);

// Rate limiting для всех запросов
const generalLimiter = rateLimit({
    windowMs: 20 * 1000, // 20 секунд
    max: 100, // максимум 100 запросов с одного IP
    message: { error: 'Слишком много запросов, попробуйте через 20 секунд' },
    standardHeaders: true,
    legacyHeaders: false
});

// Строгий rate limiting для auth эндпоинтов
const authLimiter = rateLimit({
    windowMs: 20 * 1000, // 20 секунд
    max: 10, // максимум 10 попыток входа
    message: { error: 'Слишком много попыток входа, попробуйте через 20 секунд' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware

// Security headers с helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://telegram-bots-backend.onrender.com"],
            fontSrc: ["'self'"],
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

// Безопасное логирование запросов (ПЕРЕД парсингом, чтобы ловить ошибки парсинга)
app.use((req, res, next) => {
    const safeUrl = req.path;
    console.log(`${req.method} ${safeUrl}`);
    next();
});

// Разрешённые origins для CORS
const allowedOrigins = [
    process.env.FRONTEND_URL || 'https://telegram-bots.pl',
    'https://telegram-bots.pl',
    'https://www.telegram-bots.pl'
];

app.use(cors({
    origin: (origin, callback) => {
        // Разрешаем запросы без origin (например, mobile apps, Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json({
    limit: '1mb',
    strict: true
}));

app.use(cookieParser());
app.use(generalLimiter);

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/admin', adminRoutes);
app.get('/api/events', sseAuth, sseController.stream);

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
    // Логируем полную ошибку на сервере
    console.error('Server error:', err.stack || err);

    // Отправляем клиенту только общее сообщение в production
    if (process.env.NODE_ENV === 'production') {
        res.status(500).json({ error: 'Internal server error' });
    } else {
        // В development можем показать детали
        res.status(500).json({
            error: 'Internal server error',
            message: err.message,
            stack: err.stack
        });
    }
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

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

// Обработчики необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

// Start server
const server = app.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'https://telegram-bots.pl'}`);
    } else {
        console.log(`Server started on port ${PORT}`);
    }
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
