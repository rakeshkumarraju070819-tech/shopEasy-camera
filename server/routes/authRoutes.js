const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect } = require('../middleware/auth');
const { login, me } = require('../controllers/authController');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many login attempts. Try again in 15 minutes.' }
});

router.post('/login', loginLimiter, asyncHandler(login));
router.get('/me', protect, me);

module.exports = router;
