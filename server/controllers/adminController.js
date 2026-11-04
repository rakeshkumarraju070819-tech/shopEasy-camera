const store = require('../config/store');

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

exports.getStats = async (req, res) => {
  const v = await store.allVisitors();
  const count = (fn) => v.filter(fn).length;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = dayKey(d);
    const day = v.filter((x) => dayKey(x.startedAt) === key);
    days.push({
      date: key,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      sessions: day.length,
      accepted: day.filter((x) => x.consentDecision === 'accepted').length,
      declined: day.filter((x) => x.consentDecision === 'declined').length
    });
  }

  res.json({
    totalSessions: v.length,
    consentAccepted: count((x) => x.consentDecision === 'accepted'),
    consentDeclined: count((x) => x.consentDecision === 'declined'),
    consentPending: count((x) => x.consentDecision === 'pending'),
    permissionGranted: count((x) => x.cameraPermission === 'granted'),
    permissionDenied: count((x) => x.cameraPermission === 'denied'),
    activeDemoSessions: count((x) => x.cameraActive && x.sessionStatus === 'active'),
    simulatedRecords: count((x) => x.isSimulated),
    sessionsByDay: days
  });
};

exports.listVisitors = async (req, res) => {
  const { consent, status, q } = req.query;
  let v = await store.allVisitors();
  if (consent) v = v.filter((x) => x.consentDecision === consent);
  if (status) v = v.filter((x) => x.sessionStatus === status);
  if (q) {
    const s = String(q).toLowerCase();
    v = v.filter((x) => [x.visitorId, x.ip, x.city, x.country, x.browser].some((f) => String(f || '').toLowerCase().includes(s)));
  }
  res.json({ total: v.length, visitors: v });
};

exports.getVisitor = async (req, res) => {
  const visitor = await store.findVisitor(req.params.id);
  if (!visitor) return res.status(404).json({ message: 'Visitor session not found.' });
  res.json({ visitor });
};

exports.deleteVisitor = async (req, res) => {
  const ok = await store.deleteVisitor(req.params.id);
  if (!ok) return res.status(404).json({ message: 'Visitor session not found.' });
  res.json({ deleted: 1 });
};

/** POST /api/admin/retention/purge { olderThanDays?: number, simulatedOnly?: boolean } */
exports.purge = async (req, res) => {
  const { olderThanDays, simulatedOnly } = req.body || {};
  if (olderThanDays === undefined && !simulatedOnly) {
    return res.status(400).json({ message: 'Provide olderThanDays and/or simulatedOnly.' });
  }
  let before;
  if (olderThanDays !== undefined) {
    const n = Number(olderThanDays);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: 'olderThanDays must be 0 or greater.' });
    before = new Date(Date.now() - n * 86400000);
  }
  const deleted = await store.deleteVisitorsWhere({ before, simulatedOnly: Boolean(simulatedOnly) });
  res.json({ deleted });
};

exports.listEvents = async (req, res) => {
  const v = await store.allVisitors();
  const events = [];
  for (const x of v) {
    for (const e of x.events || []) {
      const warn = /denied|could not|unsupported|error/i.test(e.message);
      events.push({ ...e, severity: warn ? 'warning' : 'info', visitorId: x.visitorId, ip: x.ip, isSimulated: x.isSimulated });
    }
  }
  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ total: events.length, events: events.slice(0, 300) });
};

exports.getSettings = (req, res) => {
  res.json({
    storage: store.mode(),
    retentionDays: Number(process.env.RETENTION_DAYS || 0),
    ipProvider: process.env.IPINFO_TOKEN ? 'ipinfo.io' : 'ipapi.co (free tier)',
    sampleDataEnabled: process.env.NODE_ENV !== 'production' && process.env.SEED_SAMPLE_DATA === 'true'
  });
};

exports.getLiveStreams = (req, res) => {
  const { getActiveStreams } = require('../signaling');
  res.json({ liveStreams: getActiveStreams() });
};

/** GET /api/admin/live-sessions/:sessionId */
exports.getLiveSession = async (req, res) => {
  const visitor = await store.findVisitor(req.params.sessionId);
  if (!visitor) return res.status(404).json({ message: 'Live session not found.' });
  const { getActiveStreams } = require('../signaling');
  const streams = getActiveStreams();
  const stream = streams.find((s) => s.visitorId === req.params.sessionId) || null;
  res.json({ session: visitor, stream });
};

/** GET /api/admin/visitors/:sessionId/location */
exports.getVisitorLocation = async (req, res) => {
  const visitor = await store.findVisitor(req.params.sessionId);
  if (!visitor) return res.status(404).json({ message: 'Visitor not found.' });

  res.json({
    visitorId: visitor.visitorId,
    ipLocation: {
      ip: visitor.ip,
      ipVersion: visitor.ipVersion || 'IPv4',
      city: visitor.city || 'Unknown',
      region: visitor.region || 'Unknown',
      country: visitor.country || 'Unknown',
      countryCode: visitor.countryCode,
      postal: visitor.postal,
      timezone: visitor.timezone,
      isp: visitor.isp,
      asn: visitor.asn,
      org: visitor.org,
      lat: visitor.lat,
      lng: visitor.lng,
      ipSource: visitor.ipSource
    },
    gpsLocation: {
      consent: visitor.gpsConsent || 'not_requested',
      permission: visitor.gpsPermission || 'not_requested',
      sharing: Boolean(visitor.gpsSharing),
      lat: visitor.gpsLat,
      lng: visitor.gpsLng,
      accuracy: visitor.gpsAccuracy,
      updatedAt: visitor.gpsUpdatedAt
    }
  });
};

/** GET /api/admin/access-requests */
exports.getAccessRequests = (req, res) => {
  const { getAccessRequests } = require('../signaling');
  res.json({ requests: getAccessRequests() });
};
