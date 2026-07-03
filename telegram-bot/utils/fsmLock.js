// Управление блокировками для FSM

const processingLocks = new Map();
const messageUpdateMap = new Map(); // Для хранения ID сообщений к обновлению

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

// ========== MESSAGE UPDATE MECHANISM ==========
// Хранит ID последнего сообщения для каждого чата
// Используется для editMessageText вместо sendMessage

function setMessageToUpdate(chatId, messageId) {
    const key = `update_${chatId}`;
    messageUpdateMap.set(key, {
        messageId,
        timestamp: Date.now()
    });
}

function getMessageToUpdate(chatId) {
    const key = `update_${chatId}`;
    const data = messageUpdateMap.get(key);
    if (data && Date.now() - data.timestamp < 60000) { // 1 минута
        return data.messageId;
    }
    return null;
}

function clearMessageToUpdate(chatId) {
    const key = `update_${chatId}`;
    messageUpdateMap.delete(key);
}


module.exports = {
    acquireLock,
    releaseLock,
    setMessageToUpdate,
    getMessageToUpdate,
    clearMessageToUpdate
};
