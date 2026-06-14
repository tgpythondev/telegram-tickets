const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authenticateToken = require('../middleware/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);
router.get('/me', authenticateToken, authController.me);

// Telegram интеграция
router.post('/telegram/link', authenticateToken, authController.linkTelegram);
router.post('/telegram/unlink', authenticateToken, authController.unlinkTelegram);
router.get('/telegram/status', authenticateToken, authController.getTelegramStatus);
router.post('/telegram/notifications', authenticateToken, authController.toggleTelegramNotifications);

module.exports = router;
