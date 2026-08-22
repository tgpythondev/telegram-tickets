const path = require('path');
require('dotenv').config();

// ============================================================
// Dev-режим: БД в памяти (pg-mem)
// Активируется переменной DB_MODE=memory (start-dev.bat).
// PostgreSQL не нужен — схема создаётся в памяти при старте,
// данные теряются при остановке сервера.
// ============================================================
if (process.env.DB_MODE === 'memory') {
    const fs = require('fs');
    const bcrypt = require('bcryptjs');
    const { newDb } = require('pg-mem');

    const mem = newDb();
    const schema = fs.readFileSync(path.join(__dirname, '..', 'dev', 'memory-schema.sql'), 'utf8');
    mem.public.none(schema);

    // ── Тестовые данные ───────────────────────────────────────
    const adminHash = bcrypt.hashSync('Admin123!', 8);
    const demoHash = bcrypt.hashSync('Demo123!', 8);

    const adminId = mem.public.query(
        `INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', '${adminHash}', TRUE) RETURNING id`
    ).rows[0].id;

    const demoId = mem.public.query(
        `INSERT INTO users (username, password_hash, email) VALUES ('demo', '${demoHash}', 'demo@example.com') RETURNING id`
    ).rows[0].id;

    // Заказ (тикеты с order_config кабинет показывает как заказы)
    mem.public.query(
        `INSERT INTO tickets (user_id, subject, priority, status, order_config)
         VALUES (${demoId}, 'Telegram-бот: пакет Mini', 'normal', 'in_progress',
                 '{"platform":"telegram","package":"mini","language":"ru","price":{"from":3,"to":5}}'::jsonb)`
    );

    // Тикет поддержки с перепиской
    const ticketId = mem.public.query(
        `INSERT INTO tickets (user_id, subject, priority) VALUES (${demoId}, 'Вопрос по оплате', 'normal') RETURNING id`
    ).rows[0].id;
    mem.public.none(
        `INSERT INTO messages (ticket_id, user_id, content, is_admin_reply) VALUES
         (${ticketId}, ${demoId}, 'Здравствуйте! Подскажите, какие способы оплаты вы принимаете?', FALSE),
         (${ticketId}, ${adminId}, 'Привет! Принимаем карты и криптовалюту — детали пришлём после подтверждения заказа.', TRUE)`
    );

    // Промокод для теста конфигуратора
    mem.public.none(
        `INSERT INTO promo_codes (code, description, discount_percent, is_free_mini, is_active)
         VALUES ('KALIANG10', 'Тестовая скидка 10%', 10.00, FALSE, TRUE)`
    );

    const pgAdapter = mem.adapters.createPg();
    const pool = new pgAdapter.Pool();

    // pg-mem не умеет "INTERVAL '1 minute' * $n" — вычисляем
    // интервал в JS и подставляем литералом, параметр убираем.
    function patchSql(text, params) {
        const re = /INTERVAL\s+'(\d+)\s+(\w+)'\s*\*\s*\$(\d+)/gi;
        let m;
        const subs = [];
        while ((m = re.exec(text)) !== null) {
            subs.push({ start: m.index, end: m.index + m[0].length, n: Number(m[1]), unit: m[2], paramIndex: Number(m[3]) });
        }
        if (!subs.length) return { text, params };

        params = [...(params || [])];
        const removed = [];
        for (let i = subs.length - 1; i >= 0; i--) {
            const s = subs[i];
            const pi = s.paramIndex - 1;
            const value = s.n * (Number(params[pi]) || 0);
            text = text.slice(0, s.start) + `INTERVAL '${value} ${s.unit}'` + text.slice(s.end);
            params.splice(pi, 1);
            removed.push(pi);
        }
        text = text.replace(/\$(\d+)/g, (_, k) => '$' + (Number(k) - removed.filter(r => r < Number(k)).length));
        return { text, params };
    }

    console.log('[memory-db] БД в памяти готова. Логины: admin / Admin123!  и  demo / Demo123!');
    console.log('[memory-db] Данные пропадут после остановки сервера');

    module.exports = {
        query: (text, params) => {
            const patched = patchSql(text, params);
            return pool.query(patched.text, patched.params);
        },
        pool,
        memory: true
    };
} else {
    // ============================================================
    // Обычный режим: реальный PostgreSQL
    // ============================================================
    const { Pool } = require('pg');

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
}
