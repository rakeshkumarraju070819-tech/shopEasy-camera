import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { requestCameraStream, stopStream, classifyCameraError, cameraSupported, checkCameraPermission, checkGeolocationPermission } from '../services/camera';
import { BroadcasterSession, disconnectSocket, getSocket } from '../services/webrtc';
import { createSession, sendConsent, patchStatus } from '../services/visitorService';

/**
 * LiveShareContext — permission-aware sequential flow.
 *
 * IMPORTANT: Respects browser permission state on every page load.
 *
 * Customer flow
 * ─────────────
 * 1. Mount → check existing camera permission status
 *    • If 'granted': auto-start camera
 *    • If 'prompt': show needs_gesture (require user click)
 *    • If 'denied': show blocked message, NO auto-request
 *
 * 2. After camera grant → check GPS permission status
 *    • If 'granted': auto-request GPS
 *    • If 'prompt': auto-request GPS (may show native prompt)
 *    • If 'denied': skip GPS, continue camera-only
 *
 * 3. After permissions → start WebRTC broadcast automatically
 *
 * 4. LIVE → Camera icon with green dot in navbar
 *
 * Permission states are checked on EVERY page load. Previous denials are respected.
 * No auto-retry loops. No bypassing browser restrictions.
 *
 * Camera states: 'idle'|'checking'|'requesting'|'granted'|'denied'|'error'|'needs_gesture'
 * GPS states:    'idle'|'checking'|'auto_requesting'|'requesting'|'granted'|'denied'|'unavailable'|'needs_gesture'
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
      
      console.log('🌍 Checking GPS permission before request...');

      // Check GPS permission status before auto-requesting
      const gpsPermission = await checkGeolocationPermission();
      console.log('📍 GPS permission state:', gpsPermission);

      if (gpsPermission === 'denied') {
        // GPS denied - skip it, continue with camera-only
        console.log('❌ GPS permission denied - skipping GPS, camera-only mode');
        setGpsState('denied');
        if (visitorId && token) {
          patchStatus(visitorId, token, { gpsPermission: 'denied' }).catch(() => {});
        }
        _startBroadcast(); // Start camera-only broadcast
      } else {
        // GPS is 'granted' or 'prompt' - attempt to request
        console.log('🌍 Transitioning to GPS request...');
        _doRequestGps(true, () => { _startBroadcast(); });
      }

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

  // ── Check permissions and auto-start on mount ────────────────────────────
  useEffect(() => {
    let active = true;

    const initializeSharing = async () => {
      try {
        const { visitorId, token } = await ensureSession();
        if (!active) return;

        // Set up socket listeners
        const socket = getSocket({ visitorId, sessionToken: token });
        const onReq = (d) => { if (d?.requestId) setPendingAccessRequest(d); };
        const onExp = ({ requestId }) => {
          setPendingAccessRequest((p) => (p?.requestId === requestId ? null : p));
        };
        socket.on('access:request', onReq);
        socket.on('access:expired', onExp);

        console.log('🔍 Checking existing camera permission status...');
        setCameraState('checking');

        // Check existing camera permission status
        const cameraPermission = await checkCameraPermission();
        console.log('📹 Camera permission state:', cameraPermission);

        if (cameraPermission === 'granted') {
          // Permission already granted - auto-start immediately
          console.log('✅ Camera permission already granted - auto-starting');
          autoTriedRef.current = false; // Not auto-trying, already granted
          _runFlow();
        } else if (cameraPermission === 'denied') {
          // Permission denied - DO NOT auto-request
          console.log('❌ Camera permission denied - not auto-requesting');
          console.log('ℹ️  User must manually allow camera in browser settings');
          setCameraState('denied');
          setCameraError('denied');
          setShareState('idle');
          
          // Report denied status to backend
          if (visitorId && token) {
            patchStatus(visitorId, token, { cameraPermission: 'denied' }).catch(() => {});
          }
        } else {
          // Permission state is 'prompt' - user hasn't decided yet
          // Show needs_gesture to require user interaction
          console.log('⏸️  Camera permission not determined - awaiting user gesture');
          setCameraState('needs_gesture');
          setShareState('idle');
        }
      } catch (err) {
        console.error('❌ Permission check failed:', err);
        if (active) {
          setCameraState('error');
          setShareState('idle');
        }
      }
    };

    initializeSharing();

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
