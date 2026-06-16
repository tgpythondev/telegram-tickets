const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authenticateToken = require('../middleware/auth');
const csrfProtection = require('../middleware/csrf');

// CSRF token endpoint (GET запрос, без CSRF проверки)
router.get('/csrf', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// Применяем CSRF защиту ко всем мутирующим операциям
router.post('/register', csrfProtection, authController.register);
router.post('/login', csrfProtection, authController.login);
router.post('/logout', csrfProtection, authController.logout);
router.post('/refresh', csrfProtection, authController.refresh);
router.get('/me', authenticateToken, authController.me);

// Telegram интеграция
router.post('/telegram/link', authenticateToken, csrfProtection, authController.linkTelegram);
router.post('/telegram/unlink', authenticateToken, csrfProtection, authController.unlinkTelegram);
router.get('/telegram/status', authenticateToken, authController.getTelegramStatus);
router.post('/telegram/notifications', authenticateToken, csrfProtection, authController.toggleTelegramNotifications);

module.exports = router;
