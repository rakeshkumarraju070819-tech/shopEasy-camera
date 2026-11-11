import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { stopStream, cameraSupported } from '../services/camera';
import { permissionManager } from '../services/permissionManager';
import { BroadcasterSession, getSocket } from '../services/webrtc';
import { sendConsent, patchStatus } from '../services/visitorService';
import { useConsent } from './ConsentContext';

/**
 * LiveShareContext
 *
 * FLOW
 * ────
 * 1. On mount: show a one-time consent disclosure so the customer knows video
 *    will be shared with the authenticated admin.
 * 2. Customer clicks "Allow & Share" → consentGiven=true is stored.
 * 3. permissionManager requests browser camera (native Chrome prompt).
 * 4. Camera granted → store stream, immediately call startSharing().
 *    (No second button click required.)
 * 5. permissionManager then requests browser GPS (native Chrome prompt).
 * 6. GPS granted → customer may choose to share location via
 *    startGpsSharing() (called from wherever the UI surfaces it).
 *
 * Browser permission alone does NOT transmit video.
 * Transmission starts only after BOTH consent (step 2) AND browser
 * permission (step 4) are obtained.
 */

const LiveShareContext = createContext(null);

const CONSENT_KEY = 'camshield.sharing.consent';

export function LiveShareProvider({ children }) {
  // Session comes from ConsentContext — never duplicate it here.
  const { visitorId, token } = useConsent();

  // ── UI states ─────────────────────────────────────────────────────────────
  const [cameraState,  setCameraState]  = useState('idle');
  const [cameraError,  setCameraError]  = useState(null);
  const [gpsState,     setGpsState]     = useState('idle');
  const [gpsCoords,    setGpsCoords]    = useState(null);
  const [shareState,   setShareState]   = useState('idle');
  const [gpsShareState, setGpsShareState] = useState('idle');
  const [pendingAccessRequest, setPendingAccessRequest] = useState(null);

  // showConsent: true  → render the ConsentDisclosure overlay
  //              false → overlay dismissed; camera permission was (or will be) requested
  const [showConsent, setShowConsent] = useState(() => {
    // If the customer already gave consent in a previous visit, skip the overlay.
    try {
      const v = localStorage.getItem(CONSENT_KEY);
      return v === null; // null means never seen; '1' allowed; '0' declined
    } catch { return true; }
  });

  // ── Refs ──────────────────────────────────────────────────────────────────
  const streamRef      = useRef(null);
  const broadcasterRef = useRef(null);
  const watchIdRef     = useRef(null);
  const gpsCoordsRef   = useRef(null);
  const initializedRef = useRef(false);
  const consentRef     = useRef(() => {
    try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
  });

  // ── Internal: start the WebRTC broadcaster ────────────────────────────────
  const _startBroadcast = useCallback(async (stream) => {
    if (!visitorId || !token) {
      console.error('[LiveShare] CAMERA_STREAM_INITIALIZED — no session yet, deferring');
      return;
    }

    console.log('[LiveShare] CAMERA_STREAM_INITIALIZED — tracks:', stream?.getTracks().map(t => `${t.kind}:${t.readyState}`));

    setShareState('starting');

    try {
      // ── Step 1: record consent ────────────────────────────────────────────
      // sendConsent sets consentDecision='accepted'. MUST complete before
      // patchStatus or the server returns 409.
      await sendConsent(visitorId, token, 'accepted');
      console.log('[LiveShare] Consent recorded');

      // ── Step 2: record permission + activate in one PATCH ─────────────────
      await patchStatus(visitorId, token, {
        cameraPermission: 'granted',
        cameraActive:      true,
        liveSharingConsent: true,
      });
      console.log('[LiveShare] Status patched — cameraPermission=granted cameraActive=true');

      // ── Step 3: start WebRTC broadcaster ──────────────────────────────────
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

      console.log('[LiveShare] WEBRTC_CONNECTED — broadcast started, video reaching admin');
      setShareState('live');
    } catch (err) {
      console.error('[LiveShare] Broadcast error:', err);
      setShareState('error');
    }
  }, [visitorId, token]);

  // ── Permission callbacks ───────────────────────────────────────────────────
  // Use a ref so permissionManager (initialised once) always calls the latest closure.
  const callbacksRef = useRef({});

  const handleCameraGranted = useCallback((stream) => {
    console.log('[LiveShare] CAMERA_PERMISSION_GRANTED');
    streamRef.current = stream;
    setCameraState('granted');
    setCameraError(null);

    // Auto-start broadcast — customer has already given informed consent.
    _startBroadcast(stream);
  }, [_startBroadcast]);

  const handleCameraDenied = useCallback((reason) => {
    console.log('[LiveShare] Camera denied:', reason);
    setCameraState(reason === 'blocked_by_browser' ? 'needs_gesture' : 'denied');
    setCameraError(reason);
  }, []);

  const handleGpsGranted = useCallback((coords) => {
    console.log('[LiveShare] GPS browser permission granted:', coords);
    gpsCoordsRef.current = coords;
    setGpsCoords(coords);
    setGpsState('granted');
    // GPS transmission requires a separate explicit action (startGpsSharing).
  }, []);

  const handleGpsDenied = useCallback((reason) => {
    console.log('[LiveShare] GPS denied:', reason);
    setGpsState(reason === 'unavailable' ? 'unavailable' : 'denied');
  }, []);

  callbacksRef.current = {
    onCameraGranted: handleCameraGranted,
    onCameraDenied:  handleCameraDenied,
    onGpsGranted:    handleGpsGranted,
    onGpsDenied:     handleGpsDenied,
  };

  // ── Customer dismisses consent disclosure ────────────────────────────────
  // allow=true  → start camera permission flow
  // allow=false → customer declined; hide overlay, don't request camera
  const giveConsent = useCallback((allow = true) => {
    consentRef.current = allow;
    try { localStorage.setItem(CONSENT_KEY, allow ? '1' : '0'); } catch {}
    setShowConsent(false);

    if (!allow) return; // customer declined — nothing else to do

    // If the session is already ready, kick off the permission flow now.
    if (visitorId && token && !initializedRef.current) {
      initializedRef.current = true;
      _initPermissions(visitorId, token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorId, token]);

  // ── Core initialiser — separated so consent gate can call it too ──────────
  const _initPermissions = (vid, tok) => {
    console.log('[LiveShare] Initialising permission flow for session:', vid);

    if (!cameraSupported()) {
      console.error('[LiveShare] Camera not supported on this device');
      setCameraState('error');
      setCameraError('unsupported');
      return;
    }

    // Set up Socket.IO access-request listeners
    const socket = getSocket({ visitorId: vid, sessionToken: tok });
    socket.on('access:request', (data) => {
      if (data?.requestId) setPendingAccessRequest(data);
    });
    socket.on('access:expired', ({ requestId }) => {
      setPendingAccessRequest((prev) =>
        prev?.requestId === requestId ? null : prev,
      );
    });

    setCameraState('checking');

    permissionManager.initializeAutoPermissions({
      onCameraGranted: (stream) => callbacksRef.current.onCameraGranted(stream),
      onCameraDenied:  (reason) => callbacksRef.current.onCameraDenied(reason),
      onGpsGranted:    (coords) => callbacksRef.current.onGpsGranted(coords),
      onGpsDenied:     (reason) => callbacksRef.current.onGpsDenied(reason),
    }).then(() => {
      if (!streamRef.current && cameraState !== 'denied') {
        console.log('[LiveShare] Camera prompt may need a user gesture');
        setCameraState('needs_gesture');
      }
    }).catch((err) => {
      console.error('[LiveShare] Permission init error:', err);
      setCameraState('error');
      setCameraError(err.message);
    });
  };

  // ── Mount: initialise when session is ready AND consent is already given ──
  useEffect(() => {
    if (!visitorId || !token) return;         // wait for ConsentContext
    if (initializedRef.current) return;        // only once
    // consentRef.current is a function on first render (lazy init) — evaluate it
    const hasConsent = typeof consentRef.current === 'function'
      ? consentRef.current()
      : consentRef.current;
    if (!hasConsent) return;                   // wait for consent disclosure

    initializedRef.current = true;
    _initPermissions(visitorId, token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorId, token]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
    if (broadcasterRef.current) broadcasterRef.current.stop();
    if (streamRef.current) stopStream(streamRef.current);
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (broadcasterRef.current) broadcasterRef.current.stop();
      if (streamRef.current) stopStream(streamRef.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // ── Public: stop camera sharing (also stops camera tracks) ────────────────
  const stopSharing = useCallback(() => {
    console.log('[LiveShare] Stopping camera sharing + closing tracks...');

    if (broadcasterRef.current) {
      broadcasterRef.current.stop();
      broadcasterRef.current = null;
    }
    // Stop the camera tracks entirely so the camera LED turns off.
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }

    if (visitorId && token) {
      patchStatus(visitorId, token, {
        cameraActive: false,
        sharingLive:  false,
      }).catch(() => {});
    }

    setCameraState('idle');
    setShareState('stopped');
  }, [visitorId, token]);

  // ── Public: start GPS sharing (explicit consent) ───────────────────────────
  const startGpsSharing = useCallback(async () => {
    if (!gpsCoordsRef.current) {
      console.error('[LiveShare] startGpsSharing — no GPS coords yet');
      return;
    }
    if (!visitorId || !token) return;

    const coords = gpsCoordsRef.current;

    try {
      await patchStatus(visitorId, token, {
        gpsConsent:   'accepted',
        gpsPermission: 'granted',
        gpsSharing:    true,
        gpsLat:       coords.lat,
        gpsLng:       coords.lng,
        gpsAccuracy:  coords.accuracy,
      });

      const socket = getSocket({ visitorId, sessionToken: token });
      socket.emit('visitor:location:update', {
        visitorId,
        coords: { lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy },
      });
      console.log('[LiveShare] GPS coordinates sent to admin');
      setGpsShareState('active');

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
      console.error('[LiveShare] GPS sharing error:', err);
    }
  }, [visitorId, token]);

  // ── Public: stop GPS sharing ───────────────────────────────────────────────
  const stopGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (visitorId && token) {
      const socket = getSocket({ visitorId, sessionToken: token });
      socket.emit('visitor:location:stopped', { visitorId });
      patchStatus(visitorId, token, { gpsSharing: false }).catch(() => {});
    }
    setGpsShareState('stopped');
  }, [visitorId, token]);

  // ── Admin access request handlers ──────────────────────────────────────────
  const acceptAccessRequest = useCallback(async (reqData) => {
    const { requestId, requestType } = reqData || {};
    if (!visitorId || !token) return;

    const wantsCamera = requestType === 'camera' || requestType === 'both';
    const wantsGps    = requestType === 'gps'    || requestType === 'both';

    let cameraApproved = false;
    let gpsApproved    = false;

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

  // ── Derived flags ──────────────────────────────────────────────────────────
  const isLive    = shareState === 'live';
  const isGpsLive = gpsShareState === 'active';

  const value = useMemo(() => ({
    cameraState, cameraError,
    gpsState, gpsCoords,
    shareState, gpsShareState,
    isLive, isGpsLive,
    showConsent,
    pendingAccessRequest,
    giveConsent,
    stopSharing,
    startGpsSharing, stopGps,
    dismissCameraError,
    acceptAccessRequest, declineAccessRequest,
  }), [
    cameraState, cameraError,
    gpsState, gpsCoords,
    shareState, gpsShareState,
    isLive, isGpsLive,
    showConsent,
    pendingAccessRequest,
    giveConsent,
    stopSharing,
    startGpsSharing, stopGps,
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
