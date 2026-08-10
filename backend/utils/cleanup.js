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
 * Запуск периодической очистки токенов.
 * Возвращает handle интервала — вызывающий код должен сохранить
 * его и вызвать clearInterval(handle) при graceful shutdown,
 * чтобы таймер не продолжал стрелять на закрытом пуле соединений.
 *
 * @param {number} intervalHours - Интервал в часах (по умолчанию 24)
 * @returns {NodeJS.Timeout}
 */
function startTokenCleanupSchedule(intervalHours = 24) {
    const intervalMs = intervalHours * 60 * 60 * 1000;

    console.log(`⏰ Запущена периодическая очистка токенов (каждые ${intervalHours} часов)`);

    // Первая очистка сразу при старте, ошибки не роняют сервер
    cleanupExpiredTokens().catch(err =>
        console.error('❌ Ошибка первичной очистки токенов:', err.message)
    );

    // Запускаем по расписанию и возвращаем handle
    const handle = setInterval(() => {
        cleanupExpiredTokens().catch(err =>
            console.error('❌ Ошибка плановой очистки токенов:', err.message)
        );
    }, intervalMs);

    return handle;
}

module.exports = {
    cleanupExpiredTokens,
    startTokenCleanupSchedule
};
