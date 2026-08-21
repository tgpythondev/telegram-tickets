const { Pool } = require('pg');
require('dotenv').config();

// Cloud-БД (Supabase, Neon) требуют SSL даже в локальной разработке.
// В production используем строгую проверку сертификата.
function getSslConfig() {
    if (process.env.NODE_ENV === 'production') {
        return { rejectUnauthorized: true };
    }
    const url = process.env.DATABASE_URL || '';
    if (/supabase\.com|neon\.tech/.test(url)) {
        return { rejectUnauthorized: false };
    }
    return false;
}

// На одноядерном сервере большой пул только создаёт давление на PostgreSQL
// и расходует память впустую. 5 соединений достаточно для нашей нагрузки;
// pg сам будет их переиспользовать через очередь.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getSslConfig(),
    max: 5,                      // было 20 — снижаем для 1-core
    min: 1,                      // держать хотя бы одно соединение живым
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    // Количество ожидающих в очереди запросов (защита от OOM при пике)
    maxWaitingClients: 50
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    setTimeout(() => {
        console.error('Exiting due to database error');
        process.exit(-1);
    }, 1000);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
