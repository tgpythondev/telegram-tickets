const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSIONS_FILE = path.join(__dirname, '../.sessions.json');
const sessions = new Map();
const processingLocks = new Map();

// Шифрование данных сессий
const ENCRYPTION_KEY = (() => {
    if (process.env.SESSION_ENCRYPTION_KEY) {
        if (process.env.SESSION_ENCRYPTION_KEY.length !== 64) {
            throw new Error('SESSION_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
        }
        return process.env.SESSION_ENCRYPTION_KEY;
    }

    // Если ключа нет, генерируем и сохраняем в файл
    const keyPath = path.join(__dirname, '../.session.key');
    try {
        if (fs.existsSync(keyPath)) {
            const key = fs.readFileSync(keyPath, 'utf8').trim();
            if (key.length === 64) return key;
        }

        // Генерируем новый ключ
        const newKey = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
        console.warn('⚠️  Generated new encryption key. Add SESSION_ENCRYPTION_KEY to .env!');
        console.warn('⚠️  The key has been saved to .session.key file');
        return newKey;
    } catch (error) {
        throw new Error('Failed to initialize encryption key: ' + error.message);
    }
})();

const ALGORITHM = 'aes-256-gcm';

function getKeyBuffer() {
    if (ENCRYPTION_KEY.length !== 64) {
        throw new Error('Encryption key must be exactly 64 hex characters');
    }
    return Buffer.from(ENCRYPTION_KEY, 'hex');
}

function encrypt(text) {
    try {
        const iv = crypto.randomBytes(16);
        const key = getKeyBuffer();
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return {
            iv: iv.toString('hex'),
            encryptedData: encrypted,
            authTag: authTag.toString('hex')
        };
    } catch (error) {
        console.error('Encryption error:', error.message);
        return null;
    }
}

function decrypt(encrypted) {
    try {
        // Валидация входных данных
        if (!encrypted || !encrypted.iv || !encrypted.encryptedData || !encrypted.authTag) {
            throw new Error('Invalid encrypted data structure');
        }

        if (encrypted.iv.length !== 32 || encrypted.authTag.length !== 32) {
            throw new Error('Invalid IV or authTag length');
        }

        const key = getKeyBuffer();
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            key,
            Buffer.from(encrypted.iv, 'hex')
        );

        decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));

        let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error.message);
        return null;
    }
}

// Загрузить сессии из файла при запуске
function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
            const savedSessions = JSON.parse(data);

            // Восстановить и расшифровать сессии из файла
            for (const [chatId, encryptedSession] of Object.entries(savedSessions)) {
                if (encryptedSession.encryptedData) {
                    const decrypted = decrypt(encryptedSession);
                    if (decrypted) {
                        sessions.set(chatId, JSON.parse(decrypted));
                    }
                }
            }

            console.log(`✅ Загружено ${sessions.size} сохраненных сессий`);
        }
    } catch (error) {
        console.error('Ошибка загрузки сессий:', error.message);
        // Создаем backup если файл поврежден
        if (fs.existsSync(SESSIONS_FILE)) {
            const backupPath = `${SESSIONS_FILE}.backup.${Date.now()}`;
            fs.copyFileSync(SESSIONS_FILE, backupPath);
            console.log(`📦 Создан backup поврежденного файла: ${backupPath}`);
        }
    }
}

// Сохранить сессии в файл
function saveSessions() {
    try {
        const sessionsObject = {};
        for (const [chatId, sessionData] of sessions.entries()) {
            // Шифруем данные сессии
            const encrypted = encrypt(JSON.stringify(sessionData));
            if (encrypted) {
                sessionsObject[chatId] = encrypted;
            }
        }

        // Создаем временный файл для атомарной записи
        const tempFile = `${SESSIONS_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(sessionsObject, null, 2), 'utf8');

        // Устанавливаем безопасные права доступа (только владелец может читать/писать)
        if (process.platform !== 'win32') {
            fs.chmodSync(tempFile, 0o600);
        }

        // Атомарно переименовываем
        fs.renameSync(tempFile, SESSIONS_FILE);
    } catch (error) {
        console.error('Ошибка сохранения сессий:', error.message);
    }
}

// Загрузить сессии при старте
loadSessions();

// Флаг и очередь для предотвращения race condition при записи
let saveQueue = Promise.resolve();
let isSaving = false;

function queueSave() {
    saveQueue = saveQueue
        .then(async () => {
            if (isSaving) {
                await new Promise(resolve => setTimeout(resolve, 100));
                return queueSave();
            }

            isSaving = true;
            try {
                await saveSessions();
            } finally {
                isSaving = false;
            }
        })
        .catch(err => {
            isSaving = false;
            console.error('Save queue error:', err.message);
        });

    return saveQueue;
}

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
    queueSave(); // Используем очередь вместо прямого вызова
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
    queueSave();
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

// Очистка старых сессий (уменьшено до 2 часов для безопасности)
function cleanupOldSessions() {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 часа (было 24)

    let cleaned = 0;
    for (const [chatId, session] of sessions.entries()) {
        if (now - session.lastActivity > maxAge) {
            sessions.delete(chatId);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        queueSave();
        console.log(`🧹 Очищено ${cleaned} старых сессий`);
    }
}

// Запустить очистку каждый час (вместо 6 часов)
setInterval(cleanupOldSessions, 60 * 60 * 1000);

module.exports = {
    getSession,
    setSession,
    updateSession,
    clearSession,
    isAuthenticated,
    isAdmin
};
