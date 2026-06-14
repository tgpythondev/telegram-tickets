const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/tickets.controller');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', ticketsController.listUserTickets);
router.get('/:id', ticketsController.getTicket);
router.post('/', ticketsController.createTicket);
router.post('/:id/messages', ticketsController.addMessage);
router.patch('/:id/status', ticketsController.updateStatus);

module.exports = router;
