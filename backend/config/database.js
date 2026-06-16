const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: true, // Изменено на true для безопасности
        // Если используется самоподписанный сертификат, нужно указать ca:
        // ca: fs.readFileSync('/path/to/server-certificates/root.crt').toString()
    } : false,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 20, // максимум 20 соединений в пуле
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    // Graceful shutdown вместо немедленного выхода
    setTimeout(() => {
        console.error('Exiting due to database error');
        process.exit(-1);
    }, 1000);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
