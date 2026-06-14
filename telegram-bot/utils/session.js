const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = path.join(__dirname, '../.sessions.json');
const sessions = new Map();

// Загрузить сессии из файла при запуске
function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
            const savedSessions = JSON.parse(data);

            // Восстановить сессии из файла
            for (const [chatId, sessionData] of Object.entries(savedSessions)) {
                sessions.set(chatId, sessionData);
            }

            console.log(`✅ Загружено ${sessions.size} сохраненных сессий`);
        }
    } catch (error) {
        console.error('Ошибка загрузки сессий:', error.message);
    }
}

// Сохранить сессии в файл
function saveSessions() {
    try {
        const sessionsObject = {};
        for (const [chatId, sessionData] of sessions.entries()) {
            sessionsObject[chatId] = sessionData;
        }

        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsObject, null, 2), 'utf8');
    } catch (error) {
        console.error('Ошибка сохранения сессий:', error.message);
    }
}

// Загрузить сессии при старте
loadSessions();

// Получить сессию пользователя
function getSession(chatId) {
    return sessions.get(chatId) || null;
}

// Установить сессию
function setSession(chatId, data) {
    sessions.set(chatId, {
        ...data,
        lastActivity: Date.now()
    });
    saveSessions(); // Сохраняем после каждого изменения
}

// Обновить сессию
function updateSession(chatId, updates) {
    const session = getSession(chatId);
    if (session) {
        setSession(chatId, { ...session, ...updates });
    }
}

// Удалить сессию
function clearSession(chatId) {
    sessions.delete(chatId);
    saveSessions();
}

// Проверить авторизацию
function isAuthenticated(chatId) {
    const session = getSession(chatId);
    return session && session.accessToken;
}

// Проверить админа
function isAdmin(chatId) {
    const session = getSession(chatId);
    return session && session.isAdmin === true;
}

// Очистка старых сессий (старше 24 часов)
function cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 часа

    let cleaned = 0;
    for (const [chatId, session] of sessions.entries()) {
        if (now - session.lastActivity > maxAge) {
            sessions.delete(chatId);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        saveSessions();
        console.log(`🧹 Очищено ${cleaned} старых сессий`);
    }
}

// Запустить очистку каждые 6 часов
setInterval(cleanupOldSessions, 6 * 60 * 60 * 1000);

module.exports = {
    getSession,
    setSession,
    updateSession,
    clearSession,
    isAuthenticated,
    isAdmin
};
