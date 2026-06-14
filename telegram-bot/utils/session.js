const sessions = new Map();

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

    for (const [chatId, session] of sessions.entries()) {
        if (now - session.lastActivity > maxAge) {
            sessions.delete(chatId);
        }
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
