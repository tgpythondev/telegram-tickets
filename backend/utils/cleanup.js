const db = require('../config/database');

/**
 * Очистка истёкших refresh токенов из базы данных
 */
async function cleanupExpiredTokens() {
    try {
        const result = await db.query(
            'DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP'
        );

        const deletedCount = result.rowCount || 0;

        if (deletedCount > 0) {
            console.log(`🧹 Очищено ${deletedCount} истёкших refresh токенов`);
        }

        return deletedCount;
    } catch (error) {
        console.error('❌ Ошибка очистки истёкших токенов:', error.message);
        return 0;
    }
}

/**
 * Запуск периодической очистки токенов
 * @param {number} intervalHours - Интервал в часах (по умолчанию 24)
 */
function startTokenCleanupSchedule(intervalHours = 24) {
    const intervalMs = intervalHours * 60 * 60 * 1000;

    console.log(`⏰ Запущена периодическая очистка токенов (каждые ${intervalHours} часов)`);

    // Запускаем первую очистку сразу
    cleanupExpiredTokens();

    // Затем запускаем по расписанию
    setInterval(() => {
        cleanupExpiredTokens();
    }, intervalMs);
}

module.exports = {
    cleanupExpiredTokens,
    startTokenCleanupSchedule
};
