// Управление блокировками для FSM

const processingLocks = new Map();

function acquireLock(chatId) {
    if (processingLocks.has(chatId)) {
        return false; // Уже обрабатывается
    }
    processingLocks.set(chatId, Date.now());
    return true;
}

function releaseLock(chatId) {
    processingLocks.delete(chatId);
}

// Очистка зависших локов (старше 30 секунд)
setInterval(() => {
    const now = Date.now();
    for (const [chatId, lockTime] of processingLocks.entries()) {
        if (now - lockTime > 30000) {
            processingLocks.delete(chatId);
            console.warn(`🧹 Removed stuck lock for chat ${chatId}`);
        }
    }
}, 10000);

module.exports = {
    acquireLock,
    releaseLock
};
