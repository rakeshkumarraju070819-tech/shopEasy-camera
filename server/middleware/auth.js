const jwt = require('jsonwebtoken');
const store = require('../config/store');

/** Requires a valid admin JWT (Authorization: Bearer <token>). */
exports.protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ message: 'Administrator access required.' });
    const user = await store.findUserByEmail(payload.sub);
    if (!user || user.role !== 'admin') return res.status(403).json({ message: 'Administrator access required.' });
    req.admin = { email: user.email };
    next();
  } catch {
    res.status(401).json({ message: 'Session expired or invalid. Please sign in again.' });
  }
};
