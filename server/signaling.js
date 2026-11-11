const crypto = require('crypto');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const store = require('./config/store');

/**
 * In-memory map of active live camera streams:
 * visitorId -> { visitorId, broadcasterSocketId, browser, os, deviceType, startedAt, connectionStatus }
 */
const activeStreams = new Map();

/**
 * In-memory store for Admin Access Requests:
 * requestId -> { requestId, visitorId, adminEmail, requestType, status, createdAt, expiresAt, respondedAt }
 * visitorPendingRequests: visitorId -> requestId
 */
const accessRequests = new Map();
const visitorPendingRequests = new Map();

function initSignaling(httpServer, corsOptions) {
  const io = new Server(httpServer, {
    cors: corsOptions || {
      origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(','),
      credentials: false
    }
  });

  // Store io instance for access from other modules
  initSignaling._io = io;

  // Authentication & classification middleware
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      // 1. Check if connecting as an authenticated Administrator
      if (auth.token) {
        try {
          const payload = jwt.verify(auth.token, process.env.JWT_SECRET);
          socket.isAdmin = true;
          socket.adminEmail = payload.sub;
          return next();
        } catch {
          // Token invalid, check for visitor credentials
        }
      }

      // 2. Check if connecting as a Visitor
      if (auth.visitorId) {
        socket.visitorId = auth.visitorId;
        socket.isVisitor = true;
        return next();
      }

      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    if (socket.isAdmin) {
      socket.join('admins');
      // Send current live demonstrations to the newly connected admin
      socket.emit('admin:active-streams', Array.from(activeStreams.values()));
      // Send recent access requests
      socket.emit('admin:access-requests', Array.from(accessRequests.values()));
    } else if (socket.isVisitor && socket.visitorId) {
      socket.join(`visitor:${socket.visitorId}`);

      // Check if there is an active pending request for this visitor
      const pendingReqId = visitorPendingRequests.get(socket.visitorId);
      if (pendingReqId) {
        const reqObj = accessRequests.get(pendingReqId);
        if (reqObj && reqObj.status === 'pending' && reqObj.expiresAt > Date.now()) {
          socket.emit('access:request', {
            requestId: reqObj.requestId,
            visitorId: reqObj.visitorId,
            adminEmail: reqObj.adminEmail,
            requestType: reqObj.requestType,
            expiresAt: reqObj.expiresAt,
            purpose: 'Live privacy and security demonstration'
          });
        }
      }
    }

    // ─── ADMIN: Request Access from a Customer ───
    socket.on('admin:request-access', async (data, callback) => {
      if (!socket.isAdmin) {
        if (typeof callback === 'function') callback({ error: 'Unauthorized.' });
        return;
      }

      const { visitorId, requestType = 'both' } = data || {};
      if (!visitorId) {
        if (typeof callback === 'function') callback({ error: 'Missing visitorId.' });
        return;
      }

      // Check if visitor exists
      const visitor = await store.findVisitor(visitorId);
      if (!visitor) {
        if (typeof callback === 'function') callback({ error: 'Visitor session not found.' });
        return;
      }

      // Prevent duplicate pending requests for this visitor
      const existingReqId = visitorPendingRequests.get(visitorId);
      if (existingReqId) {
        const existing = accessRequests.get(existingReqId);
        if (existing && existing.status === 'pending' && existing.expiresAt > Date.now()) {
          if (typeof callback === 'function') {
            callback({ error: 'A request is already pending for this visitor.', request: existing });
          }
          return;
        }
      }

      const requestId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const expiresAt = Date.now() + 60 * 1000; // 60 seconds validity

      const reqObj = {
        requestId,
        visitorId,
        adminEmail: socket.adminEmail || 'admin@camshield.com',
        requestType, // 'camera' | 'gps' | 'both'
        status: 'pending',
        createdAt,
        expiresAt
      };

      accessRequests.set(requestId, reqObj);
      visitorPendingRequests.set(visitorId, requestId);

      // Audit log event
      await store.updateVisitor(
        visitorId,
        {},
        {
          type: 'access_request',
          message: `Administrator (${reqObj.adminEmail}) requested ${requestType.toUpperCase()} access`
        }
      );

      // Send real-time request to the customer's browser room
      io.to(`visitor:${visitorId}`).emit('access:request', {
        requestId,
        visitorId,
        adminEmail: reqObj.adminEmail,
        requestType,
        expiresAt,
        purpose: 'Live privacy and security demonstration'
      });

      // Update all connected admins
      io.to('admins').emit('access:status-updated', reqObj);

      // Auto-expire after 60 seconds
      setTimeout(() => {
        const current = accessRequests.get(requestId);
        if (current && current.status === 'pending') {
          current.status = 'expired';
          visitorPendingRequests.delete(visitorId);
          io.to(`visitor:${visitorId}`).emit('access:expired', { requestId, visitorId });
          io.to('admins').emit('access:status-updated', current);
          io.to('admins').emit('access:expired', { requestId, visitorId });
        }
      }, 60 * 1000);

      if (typeof callback === 'function') callback({ success: true, request: reqObj });
    });

    // ─── CUSTOMER: Accepts Access Request ───
    socket.on('access:accepted', async (data) => {
      const { requestId, visitorId, cameraApproved, gpsApproved } = data || {};
      const reqObj = accessRequests.get(requestId);
      if (!reqObj) return;

      reqObj.status = 'accepted';
      reqObj.respondedAt = new Date().toISOString();
      reqObj.cameraApproved = Boolean(cameraApproved);
      reqObj.gpsApproved = Boolean(gpsApproved);
      visitorPendingRequests.delete(visitorId || reqObj.visitorId);

      await store.updateVisitor(
        reqObj.visitorId,
        {},
        {
          type: 'access_request',
          message: `Customer accepted access request for: ${reqObj.requestType}`
        }
      );

      io.to('admins').emit('access:status-updated', reqObj);
    });

    // ─── CUSTOMER: Declines Access Request ───
    socket.on('access:declined', async (data) => {
      const { requestId, visitorId } = data || {};
      const reqObj = accessRequests.get(requestId);
      if (!reqObj) return;

      reqObj.status = 'declined';
      reqObj.respondedAt = new Date().toISOString();
      visitorPendingRequests.delete(visitorId || reqObj.visitorId);

      await store.updateVisitor(
        reqObj.visitorId,
        {},
        {
          type: 'access_request',
          message: `Customer declined access request for: ${reqObj.requestType}`
        }
      );

      io.to('admins').emit('access:status-updated', reqObj);
    });

    // Customer explicitly starts live WebRTC broadcasting to administrator
    socket.on('broadcaster:start', async (data) => {
      const visitorId = data?.visitorId || socket.visitorId;
      if (!visitorId) return;

      socket.visitorId = visitorId;
      socket.isVisitor = true;
      socket.join(`visitor:${visitorId}`);

      const visitor = await store.findVisitor(visitorId);
      // Security: Only allow if explicitly consented to live sharing and granted browser permission
      if (!visitor || visitor.consentDecision !== 'accepted' || visitor.cameraPermission !== 'granted') {
        socket.emit('broadcaster:error', { message: 'Camera permission and explicit consent are required for live sharing.' });
        return;
      }

      const streamInfo = {
        visitorId,
        broadcasterSocketId: socket.id,
        browser: data?.browser || visitor.browser || 'Unknown',
        os: data?.os || visitor.os || 'Unknown',
        deviceType: data?.deviceType || visitor.deviceType || 'desktop',
        startedAt: new Date().toISOString(),
        sharingStatus: 'active',
        connectionStatus: 'broadcasting'
      };

      activeStreams.set(visitorId, streamInfo);

      // Update store record
      await store.updateVisitor(
        visitorId,
        { cameraActive: true, liveSharingConsent: true, sharingLive: true, sessionStatus: 'active' },
        { type: 'camera', message: 'Authorized live camera sharing started with administrator' }
      );

      // Notify all connected administrators
      io.to('admins').emit('stream:available', streamInfo);
      io.to('admins').emit('visitor:camera:started', streamInfo);
      socket.emit('broadcaster:ready', { visitorId });
    });

    // Admin requests to view a specific visitor's live demonstration
    socket.on('viewer:join', (data) => {
      if (!socket.isAdmin) return;
      const { visitorId } = data || {};
      const stream = activeStreams.get(visitorId);
      if (!stream) {
        socket.emit('viewer:error', { visitorId, message: 'Live stream not found or ended.' });
        return;
      }

      // Tell the customer's broadcaster directly via their socket ID only.
      // Do NOT also emit to the visitor room — the broadcaster socket is already
      // in that room, which would cause it to receive viewer:ready twice, create
      // two RTCPeerConnections, and send two conflicting offers to the same admin.
      if (stream.broadcasterSocketId) {
        io.to(stream.broadcasterSocketId).emit('viewer:ready', {
          adminSocketId: socket.id,
          visitorId
        });
      }
    });

    // WebRTC Offer from Customer Broadcaster -> Admin Viewer
    socket.on('webrtc:offer', (data) => {
      const { targetAdminId, offer, visitorId } = data || {};
      if (targetAdminId && offer) {
        io.to(targetAdminId).emit('webrtc:offer', {
          offer,
          visitorId,
          customerSocketId: socket.id
        });
      }
    });

    // WebRTC Answer from Admin Viewer -> Customer Broadcaster
    socket.on('webrtc:answer', (data) => {
      if (!socket.isAdmin) return;
      const { targetCustomerId, answer, visitorId } = data || {};
      if (targetCustomerId && answer) {
        io.to(targetCustomerId).emit('webrtc:answer', {
          answer,
          visitorId,
          adminSocketId: socket.id
        });
      }
    });

    // ICE Candidate exchange between customer and admin
    socket.on('webrtc:ice-candidate', (data) => {
      const { targetSocketId, candidate, visitorId } = data || {};
      if (targetSocketId && candidate) {
        io.to(targetSocketId).emit('webrtc:ice-candidate', {
          candidate,
          visitorId,
          senderSocketId: socket.id
        });
      }
    });

    // GPS location update from customer — with async reverse geocoding
    socket.on('visitor:location:update', async (data) => {
      const visitorId = data?.visitorId || socket.visitorId;
      if (!visitorId) return;
      const { lat, lng, accuracy } = data?.coords || {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      const updatedAt = new Date();
      const accuracyVal = typeof accuracy === 'number' ? accuracy : 10;

      // Attempt reverse geocoding via Nominatim (free, no API key required)
      let gpsAddress = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
          {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'CamShield-SecurityConsole/1.0' }
          }
        );
        clearTimeout(t);
        if (geoRes.ok) {
          const geo = await geoRes.json();
          if (geo?.address) {
            const a = geo.address;
            gpsAddress = {
              formatted: geo.display_name || null,
              country: a.country || null,
              state: a.state || a.province || null,
              city: a.city || a.town || a.village || a.county || null,
              district: a.suburb || a.district || a.neighbourhood || null,
              postalCode: a.postcode || null
            };
            console.log(`[signaling] GPS reverse-geocoded: ${gpsAddress.city}, ${gpsAddress.state}, ${gpsAddress.country}`);
          }
        }
      } catch (err) {
        // Reverse geocoding is best-effort — never block on it
        console.warn('[signaling] Reverse geocoding failed:', err.message);
      }

      await store.updateVisitor(
        visitorId,
        {
          gpsConsent: 'accepted',
          gpsPermission: 'granted',
          gpsSharing: true,
          gpsLat: lat,
          gpsLng: lng,
          gpsAccuracy: accuracyVal,
          gpsUpdatedAt: updatedAt,
          ...(gpsAddress ? {
            gpsAddressFormatted: gpsAddress.formatted,
            gpsCountry: gpsAddress.country,
            gpsState: gpsAddress.state,
            gpsCity: gpsAddress.city,
            gpsDistrict: gpsAddress.district,
            gpsPostalCode: gpsAddress.postalCode
          } : {})
        },
        {
          type: 'location',
          message: `GPS location updated (${lat.toFixed(5)}, ${lng.toFixed(5)} ±${Math.round(accuracyVal)}m)${gpsAddress?.city ? ` — ${gpsAddress.city}, ${gpsAddress.country}` : ''}`
        }
      );

      io.to('admins').emit('visitor:location:update', {
        visitorId,
        coords: {
          lat,
          lng,
          accuracy: accuracyVal,
          updatedAt,
          address: gpsAddress
        }
      });
    });

    // GPS location stopped by customer
    socket.on('visitor:location:stopped', async (data) => {
      const visitorId = data?.visitorId || socket.visitorId;
      if (!visitorId) return;
      await store.updateVisitor(
        visitorId,
        { gpsSharing: false },
        { type: 'location', message: 'GPS location sharing stopped by customer' }
      );
      io.to('admins').emit('visitor:location:stopped', { visitorId });
    });

    // Customer explicitly stops live sharing
    socket.on('broadcaster:stop', async (data) => {
      const visitorId = data?.visitorId || socket.visitorId;
      if (!visitorId) return;

      if (activeStreams.has(visitorId)) {
        activeStreams.delete(visitorId);
        io.to('admins').emit('stream:stopped', { visitorId });
        io.to('admins').emit('visitor:camera:stopped', { visitorId });

        await store.updateVisitor(
          visitorId,
          { cameraActive: false, sharingLive: false, sessionStatus: 'ended', endedAt: new Date() },
          { type: 'camera', message: 'Live camera sharing stopped by customer' }
        );
      }
    });

    // Disconnect cleanup
    socket.on('disconnect', async () => {
      if (socket.isVisitor && socket.visitorId && activeStreams.has(socket.visitorId)) {
        activeStreams.delete(socket.visitorId);
        io.to('admins').emit('stream:stopped', { visitorId: socket.visitorId });
        io.to('admins').emit('visitor:camera:stopped', { visitorId: socket.visitorId });

        await store.updateVisitor(
          socket.visitorId,
          { cameraActive: false, sharingLive: false, sessionStatus: 'ended', endedAt: new Date() },
          { type: 'camera', message: 'Customer disconnected; live stream stopped' }
        );
      }
    });
  });

  return io;
}

function getActiveStreams() {
  return Array.from(activeStreams.values());
}

function getAccessRequests() {
  return Array.from(accessRequests.values());
}

function getIO() {
  return initSignaling._io || null;
}

module.exports = { initSignaling, getActiveStreams, getAccessRequests, getIO };
