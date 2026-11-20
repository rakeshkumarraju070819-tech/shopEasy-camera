const crypto = require('crypto');
const store = require('../config/store');

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
exports.hashToken = hash;

/**
 * Visitors can only modify their OWN session: they must present the secret token
 * that was returned when the session was created (x-session-token header).
 *
 * Returns 401 for missing/invalid credentials.
 * Returns 404 when the session record does not exist. The body includes
 *   code: 'SESSION_GONE' when the session was legitimate but was lost due to
 *   a server restart (in-memory store wiped). Clients that receive a 404 with
 *   code=SESSION_GONE should treat status-sync calls as non-fatal and continue
 *   with peer-to-peer WebRTC.
 */
exports.requireSessionToken = async (req, res, next) => {
  const visitorId = req.params.id || req.body.visitorId;
  const token = req.headers['x-session-token'];
  if (!visitorId || !token) return res.status(401).json({ message: 'Session credentials missing.' });
  const visitor = await store.findVisitor(visitorId, { withToken: true });
  if (!visitor) {
    // Include SESSION_GONE code so the client can distinguish a cold-restart
    // wipe from a genuinely invalid visitor ID and handle it non-fatally.
    return res.status(404).json({
      message: 'Session not found.',
      code: 'SESSION_GONE'
    });
  }
  const a = Buffer.from(hash(token));
  const b = Buffer.from(visitor.tokenHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ message: 'Invalid session credentials.' });
  }
  req.visitor = visitor;
  next();
};
