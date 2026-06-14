const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authenticateToken = require('../middleware/auth');
const requireAdmin = require('../middleware/adminAuth');

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/tickets', adminController.listAllTickets);
router.get('/tickets/:id', require('../controllers/tickets.controller').getTicket);
router.patch('/tickets/:id', adminController.updateTicket);
router.post('/tickets/:id/reply', adminController.replyToTicket);
router.get('/stats', adminController.getStats);

module.exports = router;
