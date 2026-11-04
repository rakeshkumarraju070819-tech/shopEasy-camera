const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('../config/store');

// Used to keep response time similar when the email is unknown (prevents user enumeration)
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  const user = await store.findUserByEmail(email);
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ message: 'Incorrect email or password.' });

  const token = jwt.sign({ sub: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  });
  res.json({ token, admin: { email: user.email, role: user.role } });
};

exports.me = (req, res) => res.json({ admin: req.admin });
