const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/portfolio.controller');
const auth       = require('../middleware/auth');
const requireAdmin = require('../middleware/adminAuth');
const csrf       = require('../middleware/csrf');

// ── Public (no auth) ──────────────────────────────────────────────────────
// GET /api/portfolio  — список видимых проектов для страницы портфолио
router.get('/', ctrl.listPublic);

// ── Admin (auth + isAdmin) ────────────────────────────────────────────────
router.get('/admin',        auth, requireAdmin, ctrl.listAll);
router.get('/admin/:id',    auth, requireAdmin, ctrl.getOne);
router.post('/admin',       auth, requireAdmin, csrf, ctrl.create);
router.patch('/admin/:id',  auth, requireAdmin, csrf, ctrl.update);
router.delete('/admin/:id', auth, requireAdmin, csrf, ctrl.remove);

module.exports = router;
