const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireSessionToken } = require('../middleware/sessionToken');
const { createSession, recordConsent, updateStatus } = require('../controllers/visitorController');

const limiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' } });
router.use(limiter);

router.post('/session', asyncHandler(createSession));
router.post('/consent', asyncHandler(requireSessionToken), asyncHandler(recordConsent));
router.patch('/:id/status', asyncHandler(requireSessionToken), asyncHandler(updateStatus));

module.exports = router;
