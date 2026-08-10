const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const ticketsController = require('../controllers/tickets.controller');
const authenticateToken = require('../middleware/auth');
const requireAdmin = require('../middleware/adminAuth');
const csrfProtection = require('../middleware/csrf');

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/tickets', adminController.listAllTickets);
router.get('/tickets/:id', ticketsController.getTicket);
router.patch('/tickets/:id', csrfProtection, adminController.updateTicket);
router.post('/tickets/:id/reply', csrfProtection, adminController.replyToTicket);
router.get('/stats', adminController.getStats);

module.exports = router;
