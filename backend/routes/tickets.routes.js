const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/tickets.controller');
const authenticateToken = require('../middleware/auth');
const csrfProtection = require('../middleware/csrf');
const { ticketRateLimit, messageRateLimit } = require('../middleware/rateLimit');

router.use(authenticateToken);

router.get('/', ticketsController.listUserTickets);
router.get('/:id', ticketsController.getTicket);
router.post('/', ticketRateLimit, csrfProtection, ticketsController.createTicket);
router.post('/:id/messages', messageRateLimit, csrfProtection, ticketsController.addMessage);
router.patch('/:id/status', csrfProtection, ticketsController.updateStatus);

module.exports = router;
