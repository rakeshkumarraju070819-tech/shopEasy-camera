import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { stopStream, cameraSupported } from '../services/camera';
import { permissionManager } from '../services/permissionManager';
import { BroadcasterSession, getSocket } from '../services/webrtc';
import { sendConsent, patchStatus } from '../services/visitorService';
import { useConsent } from './ConsentContext';

/**
 * LiveShareContext
 *
 * PERMISSION FLOW — no custom popups, only native Chrome prompts
 * ──────────────────────────────────────────────────────────────
 * 1. As soon as the visitor session exists (ConsentContext), call
 *    permissionManager.initializeAutoPermissions().
 *    - Chrome shows its own native camera permission prompt.
 *    - If Chrome requires a user gesture first, cameraState becomes
 *      'needs_gesture' and the first interactive click retries.
 *
 * 2. Camera GRANTED → stream stored → _startBroadcast() called immediately.
 *    _startBroadcast():
 *      a. sendConsent('accepted')               — records informed consent
 *      b. patchStatus(cameraPermission=granted) — updates session record
 *      c. BroadcasterSession.start()            — WebRTC → admin
 *
 * 3. After camera, permissionManager automatically requests GPS.
 *    Chrome shows its own native location permission prompt.
 *
 * 4. GPS GRANTED → startGpsSharing() called immediately → Socket.IO
 *    emits coordinates to admin, watchPosition() starts.
 *
 * Camera states: 'idle'|'checking'|'granted'|'denied'|'error'|'needs_gesture'
 * Share states:  'idle'|'starting'|'live'|'stopped'|'error'
 * GPS states:    'idle'|'checking'|'granted'|'denied'|'unavailable'
 * GPS share:     'idle'|'active'|'stopped'
 */

const LiveShareContext = createContext(null);

export function LiveShareProvider({ children }) {
  // Single session source — ConsentContext creates it, we never duplicate it.
  const { visitorId, token } = useConsent();

  const [cameraState,   setCameraState]   = useState('idle');
  const [cameraError,   setCameraError]   = useState(null);
  const [gpsState,      setGpsState]      = useState('idle');
  const [gpsCoords,     setGpsCoords]     = useState(null);
  const [shareState,    setShareState]    = useState('idle');
  const [gpsShareState, setGpsShareState] = useState('idle');
  const [pendingAccessRequest, setPendingAccessRequest] = useState(null);

  const streamRef      = useRef(null);
  const broadcasterRef = useRef(null);
  const watchIdRef     = useRef(null);
  const gpsCoordsRef   = useRef(null);
  const initializedRef = useRef(false);

  // Ref-forwarding so permissionManager's callbacks always call the latest closures.
  const callbacksRef = useRef({});

  // ── Internal: start the WebRTC broadcaster ─────────────────────────────────
  const _startBroadcast = useCallback(async (stream) => {
    if (!visitorId || !token) {
      console.error('[LiveShare] _startBroadcast called before session ready');
      return;
    }

    const trackInfo = stream?.getTracks().map(t => `${t.kind}:${t.readyState}:enabled=${t.enabled}`);
    console.log('[LiveShare] CAMERA_STREAM_INITIALIZED — tracks:', trackInfo);

    setShareState('starting');

    try {
      // Step 1 — record sharing consent FIRST (server gates patchStatus on this)
      await sendConsent(visitorId, token, 'accepted');
      console.log('[LiveShare] Consent recorded');

      // Step 2 — record camera permission + activate (single PATCH, correct order)
      await patchStatus(visitorId, token, {
        cameraPermission:   'granted',
        cameraActive:       true,
        liveSharingConsent: true,
      });
      console.log('[LiveShare] Status patched — cameraPermission=granted cameraActive=true');

      // Step 3 — start WebRTC broadcaster
      const session = new BroadcasterSession({
        stream,
        visitorId,
        sessionToken: token,
        onStatusChange: (status) => {
          console.log('[LiveShare] Broadcast status:', status);
          if (status === 'stopped') setShareState('stopped');
          if (status === 'error')   setShareState('error');
        },
      });

      broadcasterRef.current = session;
      await session.start();

      console.log('[LiveShare] WEBRTC_CONNECTED — broadcast started');
      setShareState('live');
    } catch (err) {
      console.error('[LiveShare] _startBroadcast error:', err);
      setShareState('error');
    }
  }, [visitorId, token]);

  // ── Internal: start GPS sharing immediately after GPS is granted ───────────
  const _startGpsSharing = useCallback(async (coords) => {
    if (!visitorId || !token) return;

    console.log('[LiveShare] GPS_PERMISSION_GRANTED — auto-starting GPS sharing:', coords);

    try {
      // Update session record with GPS consent + initial coordinates
      await patchStatus(visitorId, token, {
        gpsConsent:    'accepted',
        gpsPermission: 'granted',
        gpsSharing:    true,
        gpsLat:        coords.lat,
        gpsLng:        coords.lng,
        gpsAccuracy:   coords.accuracy,
      });

      // Send initial coordinates to admin immediately
      const socket = getSocket({ visitorId, sessionToken: token });
      socket.emit('visitor:location:update', {
        visitorId,
        coords: { lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy },
      });
      console.log('[LiveShare] GPS coordinates sent to admin');
      setGpsShareState('active');

      // Start continuous watch
      if (watchIdRef.current == null) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const c = {
              lat:      pos.coords.latitude,
              lng:      pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
            gpsCoordsRef.current = c;
            setGpsCoords(c);
            socket.emit('visitor:location:update', { visitorId, coords: c });
          },
          (err) => console.warn('[LiveShare] GPS watch error:', err.message),
          { enableHighAccuracy: true },
        );
      }
    } catch (err) {
      console.error('[LiveShare] _startGpsSharing error:', err);
    }
  }, [visitorId, token]);

  // ── Permission callbacks ───────────────────────────────────────────────────
  const handleCameraGranted = useCallback((stream) => {
    console.log('[LiveShare] CAMERA_PERMISSION_GRANTED');
    streamRef.current = stream;
    setCameraState('granted');
    setCameraError(null);
    // Auto-start broadcast — native Chrome prompt IS the consent mechanism.
    _startBroadcast(stream);
  }, [_startBroadcast]);

  const handleCameraDenied = useCallback((reason) => {
    console.log('[LiveShare] Camera permission denied:', reason);
    setCameraState(reason === 'blocked_by_browser' ? 'needs_gesture' : 'denied');
    setCameraError(reason);
  }, []);

  const handleGpsGranted = useCallback((coords) => {
    console.log('[LiveShare] GPS_PERMISSION_GRANTED:', coords);
    gpsCoordsRef.current = coords;
    setGpsCoords(coords);
    setGpsState('granted');
    // Auto-start GPS sharing — native Chrome location prompt IS the consent.
    _startGpsSharing(coords);
  }, [_startGpsSharing]);

  const handleGpsDenied = useCallback((reason) => {
    console.log('[LiveShare] GPS permission denied:', reason);
    setGpsState(reason === 'unavailable' ? 'unavailable' : 'denied');
  }, []);

  // Keep ref fresh so permissionManager always calls current version
  callbacksRef.current = {
    onCameraGranted: handleCameraGranted,
    onCameraDenied:  handleCameraDenied,
    onGpsGranted:    handleGpsGranted,
    onGpsDenied:     handleGpsDenied,
  };

  // ── Mount: start permission flow as soon as session is ready ──────────────
  useEffect(() => {
    if (!visitorId || !token) return;   // wait for ConsentContext to create session
    if (initializedRef.current) return; // only once per mount

    initializedRef.current = true;
    console.log('[LiveShare] Initialising permission flow for session:', visitorId);

    if (!cameraSupported()) {
      console.error('[LiveShare] Camera not supported');
      setCameraState('error');
      setCameraError('unsupported');
      return;
    }

    // Set up Socket.IO access-request listeners
    const socket = getSocket({ visitorId, sessionToken: token });
    socket.on('access:request', (data) => {
      if (data?.requestId) setPendingAccessRequest(data);
    });
    socket.on('access:expired', ({ requestId }) => {
      setPendingAccessRequest((prev) =>
        prev?.requestId === requestId ? null : prev,
      );
    });

    setCameraState('checking');

    // permissionManager: tries camera first, then GPS after camera succeeds.
    // Both use native browser prompts — no custom UI.
    permissionManager.initializeAutoPermissions({
      onCameraGranted: (stream) => callbacksRef.current.onCameraGranted(stream),
      onCameraDenied:  (reason) => callbacksRef.current.onCameraDenied(reason),
      onGpsGranted:    (coords) => callbacksRef.current.onGpsGranted(coords),
      onGpsDenied:     (reason) => callbacksRef.current.onGpsDenied(reason),
    }).then(() => {
      // If camera still not obtained, the browser requires a user gesture.
      // CameraShareBar handles retries on click.
      if (!streamRef.current && cameraState !== 'denied') {
        setCameraState('needs_gesture');
      }
    }).catch((err) => {
      console.error('[LiveShare] Permission init error:', err);
      setCameraState('error');
      setCameraError(err.message);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorId, token]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => () => {
    if (watchIdRef.current != null)  navigator.geolocation?.clearWatch(watchIdRef.current);
    if (broadcasterRef.current)      broadcasterRef.current.stop();
    if (streamRef.current)           stopStream(streamRef.current);
  }, []);

  // ── pagehide: stop sharing, keep session active ────────────────────────────
  useEffect(() => {
    const onHide = () => {
      if (watchIdRef.current != null)  navigator.geolocation?.clearWatch(watchIdRef.current);
      if (broadcasterRef.current)      broadcasterRef.current.stop();
      if (streamRef.current)           stopStream(streamRef.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // ── Public: stop camera sharing + stop camera tracks ──────────────────────
  const stopSharing = useCallback(() => {
    console.log('[LiveShare] Stopping camera sharing...');
    if (broadcasterRef.current) {
      broadcasterRef.current.stop();
      broadcasterRef.current = null;
    }
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }
    if (visitorId && token) {
      patchStatus(visitorId, token, { cameraActive: false, sharingLive: false }).catch(() => {});
    }
    setCameraState('idle');
    setShareState('stopped');
  }, [visitorId, token]);

  // ── Public: stop GPS sharing ───────────────────────────────────────────────
  const stopGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (visitorId && token) {
      getSocket({ visitorId, sessionToken: token }).emit('visitor:location:stopped', { visitorId });
      patchStatus(visitorId, token, { gpsSharing: false }).catch(() => {});
    }
    setGpsShareState('stopped');
  }, [visitorId, token]);

  // ── Admin access-request handlers ─────────────────────────────────────────
  const acceptAccessRequest = useCallback(async (reqData) => {
    const { requestId, requestType } = reqData || {};
    if (!visitorId || !token) return;
    const wantsCamera = requestType === 'camera' || requestType === 'both';
    const wantsGps    = requestType === 'gps'    || requestType === 'both';
    let cameraApproved = false, gpsApproved = false;
    if (wantsCamera) {
      if (!streamRef.current) await permissionManager.retryCameraPermission();
      cameraApproved = !!streamRef.current;
    }
    if (wantsGps) {
      if (!gpsCoordsRef.current) await permissionManager.retryGpsPermission();
      gpsApproved = !!gpsCoordsRef.current;
    }
    getSocket({ visitorId, sessionToken: token }).emit('access:accepted', {
      requestId, visitorId, cameraApproved, gpsApproved,
    });
    setPendingAccessRequest(null);
  }, [visitorId, token]);

  const declineAccessRequest = useCallback((reqData) => {
    if (!visitorId || !token) return;
    getSocket({ visitorId, sessionToken: token }).emit('access:declined', {
      requestId: reqData?.requestId, visitorId,
    });
    setPendingAccessRequest(null);
  }, [visitorId, token]);

  const dismissCameraError = useCallback(() => setCameraError(null), []);

  const isLive    = shareState === 'live';
  const isGpsLive = gpsShareState === 'active';

  const value = useMemo(() => ({
    cameraState, cameraError,
    gpsState, gpsCoords,
    shareState, gpsShareState,
    isLive, isGpsLive,
    pendingAccessRequest,
    stopSharing, stopGps,
    dismissCameraError,
    acceptAccessRequest, declineAccessRequest,
  }), [
    cameraState, cameraError,
    gpsState, gpsCoords,
    shareState, gpsShareState,
    isLive, isGpsLive,
    pendingAccessRequest,
    stopSharing, stopGps,
    dismissCameraError,
    acceptAccessRequest, declineAccessRequest,
  ]);

  return (
    <LiveShareContext.Provider value={value}>
      {children}
    </LiveShareContext.Provider>
  );
}

export const useLiveShare = () => useContext(LiveShareContext);
