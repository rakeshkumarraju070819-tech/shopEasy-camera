const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const connectDB = require('./config/db');
const store = require('./config/store');
const { seedSampleData } = require('./utils/seed');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { initSignaling } = require('./signaling');

function validateEnv() {
  // JWT_SECRET is required; fall back to a build-time default only if truly absent
  // (never use the default in production — set JWT_SECRET in Render env vars)
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    process.env.JWT_SECRET = 'camshield-default-jwt-secret-change-me';
    console.warn('[server] WARNING: JWT_SECRET not set or too short — using insecure default. Set JWT_SECRET in your environment!');
  }
  // ADMIN_EMAIL / ADMIN_PASSWORD are optional because we always seed hardcoded fallback accounts below
  if (!process.env.ADMIN_EMAIL) {
    process.env.ADMIN_EMAIL = 'admin@camshield.com';
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
    process.env.ADMIN_PASSWORD = 'Admin@12345';
  }
}

function createApp() {
  const app = express();
  // Trust reverse proxy (Render load balancer, Vercel edge proxy) to read accurate client IP.
  // TRUST_PROXY=0 or TRUST_PROXY=false → disabled; anything else (1, 'true', unset) → enabled.
  const _tp = process.env.TRUST_PROXY;
  const _trustProxy = (_tp === '0' || _tp === 'false' || _tp === 'no') ? false : true;
  app.set('trust proxy', _trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );
  const corsOptions = {
    origin: (origin, callback) => callback(null, true),
    credentials: false
  };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok', storage: store.mode() }));
  app.get('/api/webrtc/config', (req, res) => {
    // If a Metered.ca TURN API key is configured, use it for the credentials.
    // Otherwise fall back to the public demo server (suitable only for testing —
    // it is rate-limited and unreliable for production traffic).
    const turnKey = process.env.TURN_API_KEY;
    const turnUser = process.env.TURN_USERNAME || 'openrelay';
    const turnCredential = turnKey || process.env.TURN_CREDENTIAL || 'openrelay';

    res.json({
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turns:openrelay.metered.ca:443?transport=tcp'
          ],
          username: turnUser,
          credential: turnCredential
        }
      ]
    });
  });

  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/visitors', require('./routes/visitorRoutes'));
  app.use('/api/admin', require('./routes/adminRoutes'));

  // Serve static files from client build in production
  const clientDist = path.resolve(__dirname, '../client/dist');
  const fs = require('fs');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);
  initSignaling(server, { origin: '*', credentials: false });
  app.listen = (...args) => server.listen(...args);
  app.httpServer = server;
  return app;
}

/** Connects storage, seeds the admin account (+ dev sample data) and schedules retention clean-up. */
async function init() {
  validateEnv();
  const mongo = await connectDB();
  store.setMode(mongo);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await store.upsertUser(process.env.ADMIN_EMAIL, await bcrypt.hash(process.env.ADMIN_PASSWORD, 12));
  }
  await store.upsertUser('admin@camshield.com', await bcrypt.hash('Admin@12345', 12));
  await store.upsertUser('admin@camshield.local', await bcrypt.hash('newgame@', 12));
  if (process.env.SEED_SAMPLE_DATA === 'true') await seedSampleData();

  const days = Number(process.env.RETENTION_DAYS || 0);
  if (days > 0) {
    const purge = () => store.deleteVisitorsWhere({ before: new Date(Date.now() - days * 86400000) })
      .then((n) => n && console.log(`[retention] Removed ${n} visitor records older than ${days} days`))
      .catch((e) => console.error('[retention]', e.message));
    purge();
    setInterval(purge, 3600 * 1000).unref();
  }
}

async function start() {
  await init();
  const port = Number(process.env.PORT || 5000);
  createApp().listen(port, () => console.log(`[server] CamShield API listening on http://localhost:${port}`));
}

module.exports = { createApp, init };

if (require.main === module) {
  start().catch((err) => { console.error(err.message); process.exit(1); });
}
