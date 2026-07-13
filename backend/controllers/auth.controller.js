const bcrypt = require('bcryptjs');
const db = require('../models/db');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { logAuditEvent, AUDIT_ACTIONS } = require('../utils/audit');

// Общая функция для получения cookie настроек
function getCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
    };
}

// Регистрация
async function register(req, res) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Валидация username
        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            return res.status(400).json({ error: 'Username can only contain letters, numbers, underscore and dash' });
        }

        // Усиленная валидация пароля
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        if (password.length > 128) {
            return res.status(400).json({ error: 'Password is too long (max 128 characters)' });
        }

        if (!/[a-zA-Z]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one letter' });
        }

        if (!/[0-9]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one number' });
        }

        if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)' });
        }

        const existingUser = await db.findUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await db.createUser(username, passwordHash);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 30);
        await db.saveRefreshToken(user.id, refreshToken, refreshExpiry);

        res.cookie('refreshToken', refreshToken, getCookieOptions());

        // Audit log: успешная регистрация
        await logAuditEvent(user.id, AUDIT_ACTIONS.REGISTER, req, { username: user.username });

        res.status(201).json({
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin,
                telegram_chat_id: user.telegram_chat_id || null,
                telegram_notifications_enabled: user.telegram_notifications_enabled || false
            },
            accessToken
        });
    } catch (error) {
        console.error('Register error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Вход
async function login(req, res) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Защита от DoS через длинные пароли
        if (password.length > 128) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = await db.findUserByUsername(username);

        // Проверка блокировки аккаунта
        if (user && await db.isUserLocked(user.id)) {
            return res.status(423).json({ error: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.' });
        }

        // ЗАЩИТА ОТ TIMING ATTACK: всегда выполняем bcrypt.compare
        const dummyHash = '$2a$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
        const passwordHash = user ? user.password_hash : dummyHash;

        const isPasswordValid = await bcrypt.compare(password, passwordHash);

        if (!user || !isPasswordValid) {
            // Увеличиваем счётчик неудачных попыток
            if (user) {
                const result = await db.incrementFailedLoginAttempts(user.id);
                const attempts = result.failed_login_attempts;

                // Audit log: неудачная попытка входа
                await logAuditEvent(user.id, AUDIT_ACTIONS.LOGIN_FAILED, req, { attempts, username });

                // Блокируем аккаунт после 5 попыток
                if (attempts >= 5) {
                    await db.lockUserAccount(user.id, 30); // 30 минут блокировки

                    // Audit log: блокировка аккаунта
                    await logAuditEvent(user.id, AUDIT_ACTIONS.ACCOUNT_LOCKED, req, { attempts, lockDuration: 30 });

                    return res.status(423).json({ error: 'Account locked due to multiple failed login attempts. Try again in 30 minutes.' });
                }
            } else {
                // Попытка входа с несуществующим username
                await logAuditEvent(null, AUDIT_ACTIONS.LOGIN_FAILED, req, { username });
            }

            return res.status(401).json({ error: 'Invalid credentials' });
        }

        await db.updateLastLogin(user.id);

        // Audit log: успешный вход
        await logAuditEvent(user.id, AUDIT_ACTIONS.LOGIN_SUCCESS, req, { username: user.username });

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 30);

        // Удаляем старые refresh токены пользователя
        await db.deleteUserRefreshTokens(user.id);
        await db.saveRefreshToken(user.id, refreshToken, refreshExpiry);

        res.cookie('refreshToken', refreshToken, getCookieOptions());

        res.json({
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin,
                telegram_chat_id: user.telegram_chat_id || null,
                telegram_notifications_enabled: user.telegram_notifications_enabled || false
            },
            accessToken
        });
    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Выход
async function logout(req, res) {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (refreshToken) {
            await db.deleteRefreshToken(refreshToken);
        }

        // Инвалидируем CSRF-токен сессии
        const csrfProtection = require('../middleware/csrf');
        const csrfToken = req.headers['x-csrf-token'];
        if (csrfToken) {
            csrfProtection.invalidateToken(csrfToken);
        }

        // Audit log: выход из системы
        if (req.user) {
            await logAuditEvent(req.user.id, AUDIT_ACTIONS.LOGOUT, req);
        }

        // Для clearCookie используем те же параметры без maxAge
        const { maxAge, ...clearOptions } = getCookieOptions();
        res.clearCookie('refreshToken', clearOptions);
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Обновление access token
async function refresh(req, res) {
    try {
        const refreshToken = req.cookies.refreshToken;

        console.log('[AUTH] Refresh token request received');
        console.log('[AUTH] Has refresh token cookie:', !!refreshToken);

        if (!refreshToken) {
            console.log('[AUTH] No refresh token in cookies');
            return res.status(401).json({ error: 'Refresh token required' });
        }

        const tokenData = await db.findRefreshToken(refreshToken);
        console.log('[AUTH] Token found in DB:', !!tokenData);

        if (!tokenData) {
            console.log('[AUTH] Refresh token not found in database or expired');
            return res.status(403).json({ error: 'Invalid or expired refresh token' });
        }

        const payload = verifyRefreshToken(refreshToken);
        console.log('[AUTH] JWT verification passed, user ID:', payload.id);

        const user = await db.findUserById(payload.id);

        if (!user) {
            console.log('[AUTH] User not found:', payload.id);
            return res.status(403).json({ error: 'User not found' });
        }

        const newAccessToken = generateAccessToken(user);
        console.log('[AUTH] New access token generated for user:', user.username);

        // Audit log: обновление токена
        await logAuditEvent(user.id, AUDIT_ACTIONS.TOKEN_REFRESH, req);

        res.json({ accessToken: newAccessToken });
    } catch (error) {
        console.error('[AUTH] Refresh error:', error.message);
        res.status(403).json({ error: 'Invalid or expired refresh token' });
    }
}

// Получить текущего пользователя
async function me(req, res) {
    try {
        const user = await db.findUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin,
                telegram_chat_id: user.telegram_chat_id || null,
                telegram_notifications_enabled: user.telegram_notifications_enabled || false,
                telegram_linked_at: user.telegram_linked_at || null
            }
        });
    } catch (error) {
        console.error('Me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Привязать Telegram аккаунт
async function linkTelegram(req, res) {
    try {
        const { telegramChatId } = req.body;

        if (!telegramChatId) {
            return res.status(400).json({ error: 'Telegram chat ID is required' });
        }

        // Валидация telegram chat ID (должен быть числом)
        const chatId = typeof telegramChatId === 'string' ? parseInt(telegramChatId, 10) : telegramChatId;
        if (!Number.isInteger(chatId) || chatId === 0) {
            return res.status(400).json({ error: 'Invalid Telegram chat ID format' });
        }

        // Проверить, не привязан ли этот chat_id к другому пользователю
        const existingUser = await db.findUserByTelegramChatId(String(chatId));
        if (existingUser && existingUser.id !== req.user.id) {
            return res.status(409).json({ error: 'This Telegram account is already linked to another user' });
        }

        await db.updateUserTelegramChatId(req.user.id, String(chatId));

        // Audit log: привязка Telegram
        await logAuditEvent(req.user.id, AUDIT_ACTIONS.TELEGRAM_LINK, req, { telegramChatId });

        res.json({
            message: 'Telegram account linked successfully',
            telegramChatId
        });
    } catch (error) {
        console.error('Link Telegram error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Отвязать Telegram аккаунт
async function unlinkTelegram(req, res) {
    try {
        await db.unlinkTelegramAccount(req.user.id);

        // Audit log: отвязка Telegram
        await logAuditEvent(req.user.id, AUDIT_ACTIONS.TELEGRAM_UNLINK, req);

        res.json({ message: 'Telegram account unlinked successfully' });
    } catch (error) {
        console.error('Unlink Telegram error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Получить статус Telegram привязки
async function getTelegramStatus(req, res) {
    try {
        const user = await db.findUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            linked: !!user.telegram_chat_id,
            notificationsEnabled: user.telegram_notifications_enabled || false,
            linkedAt: user.telegram_linked_at || null
        });
    } catch (error) {
        console.error('Get Telegram status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Переключить Telegram уведомления
async function toggleTelegramNotifications(req, res) {
    try {
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'Enabled must be a boolean' });
        }

        const user = await db.findUserById(req.user.id);
        if (!user.telegram_chat_id) {
            return res.status(400).json({ error: 'Telegram account not linked' });
        }

        await db.toggleTelegramNotifications(req.user.id, enabled);

        // Audit log: изменение настроек уведомлений
        await logAuditEvent(req.user.id, AUDIT_ACTIONS.TELEGRAM_NOTIFICATIONS_TOGGLE, req, { enabled });

        res.json({ notificationsEnabled: enabled });
    } catch (error) {
        console.error('Toggle Telegram notifications error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    register,
    login,
    logout,
    refresh,
    me,
    linkTelegram,
    unlinkTelegram,
    getTelegramStatus,
    toggleTelegramNotifications
};
