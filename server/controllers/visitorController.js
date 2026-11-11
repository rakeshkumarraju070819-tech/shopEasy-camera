const crypto = require('crypto');
const store = require('../config/store');
const { lookupIp, extractClientIp } = require('../utils/ipIntel');
const { parseUserAgent } = require('../utils/userAgent');
const { hashToken } = require('../middleware/sessionToken');
const { getIO } = require('../signaling');

const PERMISSIONS = ['granted', 'denied', 'error', 'unsupported'];
const STATUSES = ['active', 'ended'];

/** POST /api/visitors/session – called only AFTER the visitor has seen the disclosure and made a choice. */
exports.createSession = async (req, res) => {
  const clientIp = extractClientIp(req);
  console.log(`[visitorController] createSession incoming IP: detected=${clientIp}, req.ip=${req.ip}`);
  const intel = await lookupIp(clientIp, req.headers);
  const rawUa = req.headers['user-agent'] || '';
  const ua = parseUserAgent(rawUa);
  const sessionToken = crypto.randomBytes(24).toString('hex');
  const visitor = await store.createVisitor({
    visitorId: crypto.randomUUID(),
    tokenHash: hashToken(sessionToken),
    ...intel,
    ...ua,
    userAgent: rawUa,
    consentDecision: 'pending',
    cameraPermission: 'not_requested',
    cameraActive: false,
    sessionStatus: 'active',
    gpsConsent: 'not_requested',
    gpsPermission: 'not_requested',
    gpsSharing: false,
    startedAt: new Date(),
    isSimulated: false,
    events: [{ type: 'session', message: 'Session started', at: new Date() }]
  });

  // Emit real-time notification to all connected admins
  try {
    const io = getIO();
    if (io) {
      io.to('admins').emit('new_visitor', {
        visitorId: visitor.visitorId,
        browser: visitor.browser,
        os: visitor.os,
        deviceType: visitor.deviceType,
        city: visitor.city,
        country: visitor.country,
        ip: visitor.ip,
        startedAt: visitor.startedAt
      });
      console.log(`[visitorController] Emitted new_visitor event for ${visitor.visitorId}`);
    }
  } catch (err) {
    console.warn('[visitorController] Could not emit new_visitor event:', err.message);
  }

  res.status(201).json({ visitorId: visitor.visitorId, sessionToken });
};

/** POST /api/visitors/consent  { visitorId, decision: 'accepted' | 'declined' } */
exports.recordConsent = async (req, res) => {
  const { decision } = req.body;
  if (!['accepted', 'declined'].includes(decision)) {
    return res.status(400).json({ message: "decision must be 'accepted' or 'declined'." });
  }
  const update = { consentDecision: decision, consentAt: new Date() };
  // Declining withdraws any earlier camera state.
  if (decision === 'declined') update.cameraActive = false;
  const visitor = await store.updateVisitor(req.visitor.visitorId, update, {
    type: 'consent',
    message: decision === 'accepted'
      ? 'Visitor chose "Yes, Participate" (browser permission not requested yet)'
      : 'Visitor chose "No, Continue Shopping" – camera never requested'
  });
  res.json({ visitorId: visitor.visitorId, consentDecision: visitor.consentDecision });
};

/** PATCH /api/visitors/:id/status  { cameraPermission?, cameraActive?, liveSharingConsent?, sharingLive?, sessionStatus?, gpsConsent?, gpsPermission?, gpsSharing?, gpsLat?, gpsLng?, gpsAccuracy? } */
exports.updateStatus = async (req, res) => {
  const {
    cameraPermission,
    cameraActive,
    liveSharingConsent,
    sharingLive,
    sessionStatus,
    gpsConsent,
    gpsPermission,
    gpsSharing,
    gpsLat,
    gpsLng,
    gpsAccuracy
  } = req.body || {};
  const v = req.visitor;
  const set = {};
  let event = null;

  if (cameraPermission !== undefined) {
    if (!PERMISSIONS.includes(cameraPermission)) return res.status(400).json({ message: 'Invalid cameraPermission.' });
    if (v.consentDecision !== 'accepted') {
      return res.status(409).json({ message: 'Camera permission can only be recorded after the visitor consented.' });
    }
    set.cameraPermission = cameraPermission;
    if (cameraPermission !== 'granted') {
      set.cameraActive = false;
      set.sharingLive = false;
    }
    event = { type: 'permission', message: `Browser reported camera permission: ${cameraPermission}` };
  }

  if (liveSharingConsent !== undefined) {
    if (typeof liveSharingConsent !== 'boolean') return res.status(400).json({ message: 'liveSharingConsent must be a boolean.' });
    set.liveSharingConsent = liveSharingConsent;
    if (!liveSharingConsent) set.sharingLive = false;
    event = event || {
      type: 'consent',
      message: liveSharingConsent
        ? 'Customer explicitly confirmed live camera sharing with administrator'
        : 'Customer revoked live camera sharing consent'
    };
  }

  if (sharingLive !== undefined) {
    if (typeof sharingLive !== 'boolean') return res.status(400).json({ message: 'sharingLive must be a boolean.' });
    const perm = set.cameraPermission || v.cameraPermission;
    const consent = set.liveSharingConsent !== undefined ? set.liveSharingConsent : v.liveSharingConsent;
    if (sharingLive && (v.consentDecision !== 'accepted' || perm !== 'granted' || !consent)) {
      return res.status(409).json({ message: 'Live sharing requires consent, browser permission and explicit live confirmation.' });
    }
    set.sharingLive = sharingLive;
    if (sharingLive) set.cameraActive = true;
    event = event || {
      type: 'camera',
      message: sharingLive ? 'Live WebRTC camera streaming started to administrator' : 'Live WebRTC camera streaming stopped'
    };
  }

  if (cameraActive !== undefined) {
    if (typeof cameraActive !== 'boolean') return res.status(400).json({ message: 'cameraActive must be a boolean.' });
    const perm = set.cameraPermission || v.cameraPermission;
    if (cameraActive && (v.consentDecision !== 'accepted' || perm !== 'granted')) {
      return res.status(409).json({ message: 'Camera cannot be active without consent and browser permission.' });
    }
    set.cameraActive = cameraActive;
    if (!cameraActive) set.sharingLive = false;
    event = event || { type: 'camera', message: cameraActive ? 'Camera test preview started' : 'Camera test preview stopped' };
  }

  // GPS fields
  if (gpsConsent !== undefined) {
    if (!['accepted', 'declined'].includes(gpsConsent)) return res.status(400).json({ message: 'Invalid gpsConsent.' });
    set.gpsConsent = gpsConsent;
    if (gpsConsent === 'declined') {
      set.gpsSharing = false;
    }
    event = event || { type: 'gps_consent', message: `Customer GPS consent: ${gpsConsent}` };
  }

  if (gpsPermission !== undefined) {
    if (!['granted', 'denied', 'unsupported', 'error'].includes(gpsPermission)) return res.status(400).json({ message: 'Invalid gpsPermission.' });
    set.gpsPermission = gpsPermission;
    if (gpsPermission !== 'granted') {
      set.gpsSharing = false;
    }
    event = event || { type: 'gps_permission', message: `Browser reported GPS permission: ${gpsPermission}` };
  }

  if (gpsSharing !== undefined) {
    set.gpsSharing = Boolean(gpsSharing);
  }

  if (typeof gpsLat === 'number' && typeof gpsLng === 'number') {
    set.gpsLat = gpsLat;
    set.gpsLng = gpsLng;
    set.gpsAccuracy = typeof gpsAccuracy === 'number' ? gpsAccuracy : 10;
    set.gpsUpdatedAt = new Date();
    set.gpsSharing = true;
  }

  if (sessionStatus !== undefined) {
    if (!STATUSES.includes(sessionStatus)) return res.status(400).json({ message: 'Invalid sessionStatus.' });
    set.sessionStatus = sessionStatus;
    set.endedAt = sessionStatus === 'ended' ? new Date() : null;
    if (sessionStatus === 'ended') {
      set.cameraActive = false;
      set.sharingLive = false;
      set.gpsSharing = false;
    }
    event = event || { type: 'session', message: sessionStatus === 'ended' ? 'Session ended' : 'Session resumed' };
  }

  if (!Object.keys(set).length) return res.status(400).json({ message: 'No valid fields to update.' });
  const updated = await store.updateVisitor(v.visitorId, set, event);
  res.json({
    visitorId: updated.visitorId,
    consentDecision: updated.consentDecision,
    cameraPermission: updated.cameraPermission,
    cameraActive: updated.cameraActive,
    liveSharingConsent: updated.liveSharingConsent,
    sharingLive: updated.sharingLive,
    sessionStatus: updated.sessionStatus,
    gpsConsent: updated.gpsConsent,
    gpsPermission: updated.gpsPermission,
    gpsSharing: updated.gpsSharing,
    gpsLat: updated.gpsLat,
    gpsLng: updated.gpsLng,
    gpsAccuracy: updated.gpsAccuracy,
    gpsUpdatedAt: updated.gpsUpdatedAt
  });
};
