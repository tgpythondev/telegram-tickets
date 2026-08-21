const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauth.controller');

// Статус провайдеров (какие настроены) — frontend скрывает неактивные кнопки
router.get('/providers', oauthController.getProvidersStatus);

// Редирект на страницу авторизации провайдера
router.get('/:provider', oauthController.redirectToProvider);

// Callback от провайдера (authorization code -> сессия)
router.get('/:provider/callback', oauthController.handleCallback);

module.exports = router;
