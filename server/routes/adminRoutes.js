const router = require('express').Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { protect } = require('../middleware/auth');
const c = require('../controllers/adminController');

router.use(asyncHandler(protect)); // every admin route requires an authenticated administrator

router.get('/dashboard/stats', asyncHandler(c.getStats));
router.get('/visitors', asyncHandler(c.listVisitors));
router.get('/visitors/:id', asyncHandler(c.getVisitor));
router.delete('/visitors/:id', asyncHandler(c.deleteVisitor));
router.post('/retention/purge', asyncHandler(c.purge));
router.get('/events', asyncHandler(c.listEvents));
router.get('/live-streams', asyncHandler(c.getLiveStreams));
router.get('/live-sessions/:sessionId', asyncHandler(c.getLiveSession));
router.get('/visitors/:sessionId/location', asyncHandler(c.getVisitorLocation));
router.get('/access-requests', asyncHandler(c.getAccessRequests));
router.get('/settings', c.getSettings);

module.exports = router;
