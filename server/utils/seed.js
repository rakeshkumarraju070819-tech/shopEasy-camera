const crypto = require('crypto');
const store = require('../config/store');

/** Fictional development records. IPs are RFC 5737 documentation addresses – never real visitors. */
const SAMPLES = [
  ['203.0.113.21', 'Northvale', 'Aurelia', 'Fictionia', 'FC', '90210', 'UTC+0', 51.5, -0.12, 'Example Broadband', 'AS64496 Example Org', 'Chrome', 'Windows', 'desktop', 'accepted', 'granted', false, 'active', 2],
  ['203.0.113.34', 'Port Lumen', 'Meridian', 'Fictionia', 'FC', '10001', 'UTC-5', 40.7, -74.0, 'Sample Telecom', 'AS64497 Sample Telecom Systems', 'Safari', 'iOS', 'mobile', 'accepted', 'denied', false, 'ended', 5],
  ['198.51.100.7', 'Kestrel Bay', 'Solara', 'Examplestan', 'EX', '400001', 'UTC+5:30', 19.07, 72.87, 'Demo Fibre Co', 'AS64498 Demo Fibre Network Ltd', 'Firefox', 'Linux', 'desktop', 'declined', 'not_requested', false, 'ended', 8],
  ['198.51.100.52', 'Lowmarsh', 'Tidewater', 'Testland', 'TL', '2000', 'UTC+10', -33.86, 151.2, 'Placeholder Net', 'AS64499 Placeholder Net Backbone', 'Edge', 'Windows', 'desktop', 'accepted', 'granted', true, 'active', 1],
  ['192.0.2.88', 'Ashgrove', 'Highmoor', 'Testland', 'TL', '10115', 'UTC+1', 52.52, 13.4, 'Mock Wireless', 'AS64500 Mock Wireless Global', 'Chrome', 'Android', 'mobile', 'declined', 'not_requested', false, 'ended', 26],
  ['203.0.113.90', 'Northvale', 'Aurelia', 'Fictionia', 'FC', '90210', 'UTC+0', 51.48, -0.1, 'Example Broadband', 'AS64496 Example Org', 'Chrome', 'macOS', 'desktop', 'accepted', 'error', false, 'ended', 30],
  ['198.51.100.103', 'Port Lumen', 'Meridian', 'Fictionia', 'FC', '10001', 'UTC-5', 40.68, -73.98, 'Sample Telecom', 'AS64497 Sample Telecom Systems', 'Safari', 'macOS', 'desktop', 'accepted', 'granted', false, 'ended', 52],
  ['192.0.2.14', 'Kestrel Bay', 'Solara', 'Examplestan', 'EX', '400001', 'UTC+5:30', 19.1, 72.9, 'Demo Fibre Co', 'AS64498 Demo Fibre Network Ltd', 'Samsung Internet', 'Android', 'tablet', 'declined', 'not_requested', false, 'active', 75],
  ['203.0.113.141', 'Lowmarsh', 'Tidewater', 'Testland', 'TL', '2000', 'UTC+10', -33.9, 151.15, 'Placeholder Net', 'AS64499 Placeholder Net Backbone', 'Firefox', 'Windows', 'desktop', 'accepted', 'unsupported', false, 'ended', 98],
  ['198.51.100.200', 'Ashgrove', 'Highmoor', 'Testland', 'TL', '10115', 'UTC+1', 52.5, 13.38, 'Mock Wireless', 'AS64500 Mock Wireless Global', 'Chrome', 'Windows', 'desktop', 'pending', 'not_requested', false, 'active', 120]
];

async function seedSampleData() {
  if (process.env.NODE_ENV === 'production') return 0;
  if ((await store.countVisitors()) > 0) return 0;
  const now = Date.now();
  for (const s of SAMPLES) {
    const [ip, city, region, country, countryCode, postal, timezone, lat, lng, isp, org, browser, os, deviceType, consent, perm, camActive, status, hoursAgo] = s;
    const startedAt = new Date(now - hoursAgo * 3600 * 1000);
    const events = [{ type: 'session', message: 'Session started (sample record)', at: startedAt }];
    if (consent !== 'pending') events.push({ type: 'consent', message: `Consent ${consent} (sample record)`, at: new Date(startedAt.getTime() + 20000) });
    if (perm === 'granted') events.push({ type: 'permission', message: 'Browser reported camera permission: granted (sample)', at: new Date(startedAt.getTime() + 40000) });
    if (perm === 'denied') events.push({ type: 'permission', message: 'Browser reported camera permission: denied (sample)', at: new Date(startedAt.getTime() + 40000) });
    if (perm === 'error') events.push({ type: 'permission', message: 'Camera could not be started: no camera found (sample)', at: new Date(startedAt.getTime() + 40000) });

    const hasGps = perm === 'granted' && camActive;
    await store.createVisitor({
      visitorId: crypto.randomUUID(),
      tokenHash: crypto.randomBytes(16).toString('hex'),
      ip,
      ipVersion: 'IPv4',
      ipSource: 'simulated',
      country,
      countryCode,
      region,
      city,
      postal,
      timezone,
      isp,
      org,
      asn: 'AS64496',
      lat,
      lng,
      browser,
      os,
      deviceType,
      userAgent: `Mozilla/5.0 (${os}; ${deviceType}) AppleWebKit/537.36 (KHTML, like Gecko) ${browser}/120.0.0.0 Safari/537.36`,
      consentDecision: consent,
      consentAt: consent === 'pending' ? undefined : startedAt,
      cameraPermission: perm,
      cameraActive: camActive,
      liveSharingConsent: camActive,
      sharingLive: camActive,
      gpsConsent: hasGps ? 'accepted' : 'not_requested',
      gpsPermission: hasGps ? 'granted' : 'not_requested',
      gpsSharing: hasGps,
      gpsLat: hasGps ? lat + 0.005 : undefined,
      gpsLng: hasGps ? lng + 0.005 : undefined,
      gpsAccuracy: hasGps ? 15 : undefined,
      gpsUpdatedAt: hasGps ? startedAt : undefined,
      sessionStatus: status,
      startedAt,
      endedAt: status === 'ended' ? new Date(startedAt.getTime() + 600000) : undefined,
      isSimulated: true,
      events
    });
  }
  console.log(`[seed] Added ${SAMPLES.length} FICTIONAL sample visitor records`);
  return SAMPLES.length;
}

module.exports = { seedSampleData };
