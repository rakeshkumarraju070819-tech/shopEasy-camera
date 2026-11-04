const crypto = require('crypto');
const store = require('../config/store');

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
exports.hashToken = hash;

/**
 * Visitors can only modify their OWN session: they must present the secret token
 * that was returned when the session was created (x-session-token header).
 */
exports.requireSessionToken = async (req, res, next) => {
  const visitorId = req.params.id || req.body.visitorId;
  const token = req.headers['x-session-token'];
  if (!visitorId || !token) return res.status(401).json({ message: 'Session credentials missing.' });
  const visitor = await store.findVisitor(visitorId, { withToken: true });
  if (!visitor) return res.status(404).json({ message: 'Session not found.' });
  const a = Buffer.from(hash(token));
  const b = Buffer.from(visitor.tokenHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ message: 'Invalid session credentials.' });
  }
  req.visitor = visitor;
  next();
};
