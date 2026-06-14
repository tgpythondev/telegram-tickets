const bcrypt = require('bcryptjs');
const db = require('../models/db');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');

// Регистрация
async function register(req, res) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existingUser = await db.findUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await db.createUser(username, passwordHash);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 30);
        await db.saveRefreshToken(user.id, refreshToken, refreshExpiry);

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        res.status(201).json({
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin
            },
            accessToken
        });
    } catch (error) {
        console.error('Register error:', error);
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

        const user = await db.findUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        await db.updateLastLogin(user.id);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const refreshExpiry = new Date();
        refreshExpiry.setDate(refreshExpiry.getDate() + 30);
        await db.saveRefreshToken(user.id, refreshToken, refreshExpiry);

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        res.json({
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.is_admin
            },
            accessToken
        });
    } catch (error) {
        console.error('Login error:', error);
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

        res.clearCookie('refreshToken');
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

        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token required' });
        }

        const tokenData = await db.findRefreshToken(refreshToken);
        if (!tokenData) {
            return res.status(403).json({ error: 'Invalid or expired refresh token' });
        }

        const payload = verifyRefreshToken(refreshToken);
        const user = await db.findUserById(payload.id);

        if (!user) {
            return res.status(403).json({ error: 'User not found' });
        }

        const newAccessToken = generateAccessToken(user);

        res.json({ accessToken: newAccessToken });
    } catch (error) {
        console.error('Refresh error:', error);
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
                telegram_notifications_enabled: user.telegram_notifications_enabled || false
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

        // Проверить, не привязан ли этот chat_id к другому пользователю
        const existingUser = await db.findUserByTelegramChatId(telegramChatId);
        if (existingUser && existingUser.id !== req.user.id) {
            return res.status(409).json({ error: 'This Telegram account is already linked to another user' });
        }

        await db.updateUserTelegramChatId(req.user.id, telegramChatId);

        res.json({
            message: 'Telegram account linked successfully',
            telegramChatId
        });
    } catch (error) {
        console.error('Link Telegram error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Отвязать Telegram аккаунт
async function unlinkTelegram(req, res) {
    try {
        await db.unlinkTelegramAccount(req.user.id);

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

        res.json({
            message: `Telegram notifications ${enabled ? 'enabled' : 'disabled'}`,
            notificationsEnabled: enabled
        });
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
