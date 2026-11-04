const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  { type: String, message: String, at: { type: Date, default: Date.now } },
  { _id: false }
);

const visitorSchema = new mongoose.Schema(
  {
    visitorId: { type: String, required: true, unique: true, index: true },
    tokenHash: { type: String, required: true, select: false },

    // IP intelligence (estimated – never an exact address)
    ip: String,
    ipVersion: { type: String, default: 'IPv4' },
    ipSource: { type: String, enum: ['ipinfo', 'ipapi', 'simulated', 'unavailable'], default: 'unavailable' },
    country: String,
    countryCode: String,
    region: String,
    city: String,
    postal: String,
    timezone: String,
    isp: String,
    org: String,
    asn: String,
    lat: Number,
    lng: Number,

    // Client info
    browser: String,
    os: String,
    deviceType: String,
    userAgent: String,

    // Consent = what the visitor chose in OUR notification
    consentDecision: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    consentAt: Date,

    // Browser permission = what the BROWSER reported (separate from consent)
    cameraPermission: {
      type: String,
      enum: ['not_requested', 'granted', 'denied', 'error', 'unsupported'],
      default: 'not_requested'
    },
    // Whether the demo preview is on screen right now
    cameraActive: { type: Boolean, default: false },
    // Explicit consent for live streaming to the administrator
    liveSharingConsent: { type: Boolean, default: false },
    // Whether live WebRTC sharing is actively streaming right now
    sharingLive: { type: Boolean, default: false },

    // GPS location
    gpsConsent: { type: String, enum: ['not_requested', 'accepted', 'declined'], default: 'not_requested' },
    gpsPermission: {
      type: String,
      enum: ['not_requested', 'granted', 'denied', 'unsupported', 'error'],
      default: 'not_requested'
    },
    gpsSharing: { type: Boolean, default: false },
    gpsLat: Number,
    gpsLng: Number,
    gpsAccuracy: Number,
    gpsUpdatedAt: Date,

    sessionStatus: { type: String, enum: ['active', 'ended'], default: 'active' },
    startedAt: { type: Date, default: Date.now, index: true },
    endedAt: Date,

    isSimulated: { type: Boolean, default: false },
    events: [eventSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Visitor', visitorSchema);
