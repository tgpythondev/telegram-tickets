const express = require('express');
const router = express.Router();
const promoController = require('../controllers/promo.controller');
const authenticateToken = require('../middleware/auth');
const csrfProtection = require('../middleware/csrf');
const requireAdmin = require('../middleware/adminAuth');
const rateLimit = require('express-rate-limit');

// Rate limit for promo validation — prevent brute-forcing codes
const promoValidateLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 10,
    message: { valid: false, reason: 'too_many_requests' },
    standardHeaders: true,
    legacyHeaders: false
});

// ── User route ─────────────────────────────────────────────────────────────────
// POST /api/promo/validate — requires auth + CSRF + rate limit
router.post(
    '/validate',
    authenticateToken,
    promoValidateLimiter,
    csrfProtection,
    promoController.validatePromo
);

// ── Admin routes ───────────────────────────────────────────────────────────────
// All admin routes require auth + admin role + CSRF
router.get(
    '/admin',
    authenticateToken,
    requireAdmin,
    promoController.listPromoCodes
);

router.post(
    '/admin',
    authenticateToken,
    requireAdmin,
    csrfProtection,
    promoController.createPromoCode
);

router.get(
    '/admin/:id',
    authenticateToken,
    requireAdmin,
    promoController.getPromoCode
);

router.patch(
    '/admin/:id',
    authenticateToken,
    requireAdmin,
    csrfProtection,
    promoController.updatePromoCode
);

router.delete(
    '/admin/:id',
    authenticateToken,
    requireAdmin,
    csrfProtection,
    promoController.deletePromoCode
);

module.exports = router;
