import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { stopStream, cameraSupported } from '../services/camera';
import { permissionManager } from '../services/permissionManager';
import { BroadcasterSession, getSocket } from '../services/webrtc';
import { sendConsent, patchStatus } from '../services/visitorService';
import { useConsent } from './ConsentContext';

/**
 * LiveShareContext — Separates browser permission from sharing consent.
 *
 * FLOW:
 * 1. On first visit → automatically request browser camera permission (native prompt)
 * 2. After camera granted → automatically request browser GPS permission (native prompt)
 * 3. After both granted → camera icon shows in navbar (neutral, no green dot)
 * 4. User explicitly clicks "Start Live Video Sharing" → sends consent, starts WebRTC
 * 5. User explicitly clicks "Share My Location" → sends GPS to admin via Socket.IO
 * 6. User can stop sharing at any time → camera tracks stay alive for restart
 *
 * Browser permission ≠ consent to transmit. Nothing is sent to the admin until
 * the visitor explicitly authorizes sharing.
 *
 * Camera states: 'idle'|'checking'|'requesting'|'granted'|'denied'|'error'|'needs_gesture'
 * GPS states:    'idle'|'checking'|'requesting'|'granted'|'denied'|'unavailable'|'needs_gesture'
 * Share states:  'idle'|'starting'|'live'|'stopped'|'error'
 * GPS share:      'idle'|'active'|'stopped'
 */

const LiveShareContext = createContext(null);

export function LiveShareProvider({ children }) {
  // Single source of truth for the visitor session — comes from ConsentContext
  // so we never create a duplicate session.
  const { visitorId, token } = useConsent();

  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState(null);
  const [gpsState, setGpsState] = useState('idle');
  const [gpsCoords, setGpsCoords] = useState(null);
  const [shareState, setShareState] = useState('idle');
  const [gpsShareState, setGpsShareState] = useState('idle');
  const [pendingAccessRequest, setPendingAccessRequest] = useState(null);

  const streamRef = useRef(null);
  const broadcasterRef = useRef(null);
  const watchIdRef = useRef(null);
  const gpsCoordsRef = useRef(null);
  const initializedRef = useRef(false);

  // Refs for latest callback versions so permissionManager always calls current ones
  const callbacksRef = useRef({});

  // ── Start camera sharing (explicit consent) ──────────────────────────────
  const startSharing = useCallback(async () => {
    console.log('[LiveShare] User authorized live video sharing');

    if (!streamRef.current) {
      console.error('[LiveShare] No camera stream available');
      return;
    }
    if (!visitorId || !token) {
      console.error('[LiveShare] No visitor session');
      return;
    }

    setShareState('starting');

    try {
      // 1. Send consent FIRST — sets consentDecision='accepted' in the backend.
      //    The server rejects cameraPermission updates unless consent is accepted.
      await sendConsent(visitorId, token, 'accepted');

      // 2. Patch camera permission + active + live-sharing consent in one call.
      //    Works because step 1 set consentDecision='accepted', and the server
      //    reads set.cameraPermission for the cameraActive guard.
      await patchStatus(visitorId, token, {
        cameraPermission: 'granted',
        cameraActive: true,
        liveSharingConsent: true,
      });

      // 3. Create and start the WebRTC broadcaster session.
      const socket = getSocket({ visitorId, sessionToken: token });
      const session = new BroadcasterSession({
        stream: streamRef.current,
        visitorId,
        sessionToken: token,
        onStatusChange: (status) => {
          console.log('[LiveShare] Broadcast status:', status);
          if (status === 'stopped') setShareState('stopped');
          if (status === 'error') setShareState('error');
        },
      });

      broadcasterRef.current = session;
      await session.start();

      console.log('[LiveShare] WebRTC broadcast started — video reaching admin');
      setShareState('live');
    } catch (err) {
      console.error('[LiveShare] Broadcast error:', err);
      setShareState('error');
    }
  }, [visitorId, token]);

  // ── Stop camera sharing (keeps camera tracks alive for restart) ────────────
  const stopSharing = useCallback(() => {
    console.log('[LiveShare] Stopping camera sharing...');

    if (broadcasterRef.current) {
      broadcasterRef.current.stop(); // stops WebRTC, does NOT stop camera tracks
      broadcasterRef.current = null;
    }

    if (visitorId && token) {
      patchStatus(visitorId, token, {
        cameraActive: false,
        sharingLive: false,
      }).catch(() => {});
    }

    setShareState('stopped');
  }, [visitorId, token]);

  // ── Start GPS sharing (explicit consent) ──────────────────────────────────
  const startGpsSharing = useCallback(async () => {
    console.log('[LiveShare] User authorized location sharing');

    if (!gpsCoordsRef.current) {
      console.error('[LiveShare] No GPS coordinates available');
      return;
    }
    if (!visitorId || !token) {
      console.error('[LiveShare] No visitor session');
      return;
    }

    const coords = gpsCoordsRef.current;

    try {
      // 1. Patch GPS consent + permission + coordinates
      await patchStatus(visitorId, token, {
        gpsConsent: 'accepted',
        gpsPermission: 'granted',
        gpsSharing: true,
        gpsLat: coords.lat,
        gpsLng: coords.lng,
        gpsAccuracy: coords.accuracy,
      });

      // 2. Send GPS to admin immediately via Socket.IO
      const socket = getSocket({ visitorId, sessionToken: token });
      socket.emit('visitor:location:update', {
        visitorId,
        coords: {
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
        },
      });
      console.log('[LiveShare] GPS coordinates sent to admin');

      setGpsShareState('active');

      // 3. Start GPS watch for continuous updates
      if (watchIdRef.current == null) {
        console.log('[LiveShare] Starting GPS watch for continuous updates...');
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const c = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
            gpsCoordsRef.current = c;
            setGpsCoords(c);
            console.log('[LiveShare] GPS update:', c);
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

  // ── Stop GPS sharing ───────────────────────────────────────────────────────
  const stopGps = useCallback(() => {
    console.log('[LiveShare] Stopping GPS sharing...');

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

  // ── Permission Manager Callbacks (browser permission only, no sharing) ────
  const handleCameraGranted = useCallback((stream) => {
    console.log('[LiveShare] Camera browser permission granted');
    streamRef.current = stream;
    setCameraState('granted');
    setCameraError(null);
    // Do NOT start broadcast — wait for explicit user consent via startSharing()
  }, []);

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
    // Do NOT send GPS to admin — wait for explicit user consent via startGpsSharing()
  }, []);

  const handleGpsDenied = useCallback((reason) => {
    console.log('[LiveShare] GPS denied:', reason);
    setGpsState(reason === 'unavailable' ? 'unavailable' : 'denied');
  }, []);

  // Keep refs pointing to latest callbacks so the permissionManager (which is
  // initialised only once) always calls the current versions.
  callbacksRef.current = {
    onCameraGranted: handleCameraGranted,
    onCameraDenied: handleCameraDenied,
    onGpsGranted: handleGpsGranted,
    onGpsDenied: handleGpsDenied,
  };

  // ── Initialize when session becomes available ──────────────────────────────
  useEffect(() => {
    if (!visitorId || !token) return; // wait for ConsentContext to create session
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialize = async () => {
      try {
        console.log('[LiveShare] Initializing with session:', visitorId);

        if (!cameraSupported()) {
          console.error('[LiveShare] Camera not supported');
          setCameraState('error');
          setCameraError('unsupported');
          return;
        }

        // Set up Socket.IO listeners for admin access requests
        const socket = getSocket({ visitorId, sessionToken: token });

        const onAccessRequest = (data) => {
          if (data?.requestId) setPendingAccessRequest(data);
        };
        const onAccessExpired = ({ requestId }) => {
          setPendingAccessRequest((prev) =>
            prev?.requestId === requestId ? null : prev,
          );
        };
        socket.on('access:request', onAccessRequest);
        socket.on('access:expired', onAccessExpired);

        // Request browser camera permission (native prompt only, no sharing)
        console.log('[LiveShare] Requesting browser camera permission...');
        setCameraState('checking');

        await permissionManager.initializeAutoPermissions({
          onCameraGranted: (stream) => callbacksRef.current.onCameraGranted(stream),
          onCameraDenied: (reason) => callbacksRef.current.onCameraDenied(reason),
          onGpsGranted: (coords) => callbacksRef.current.onGpsGranted(coords),
          onGpsDenied: (reason) => callbacksRef.current.onGpsDenied(reason),
        });

        // If camera wasn't granted automatically, wait for user gesture
        if (!streamRef.current && cameraState !== 'denied') {
          console.log('[LiveShare] Waiting for user gesture to request camera');
          setCameraState('needs_gesture');
        }
      } catch (err) {
        console.error('[LiveShare] Initialization error:', err);
        setCameraState('error');
        setCameraError(err.message);
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorId, token]);

  // ── Cleanup on unmount — stop everything including camera tracks ───────────
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (broadcasterRef.current) broadcasterRef.current.stop();
      if (streamRef.current) stopStream(streamRef.current);
    };
  }, []);

  // ── pagehide — stop sharing but don't end the session ─────────────────────
  useEffect(() => {
    const onHide = () => {
      if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (broadcasterRef.current) broadcasterRef.current.stop();
      if (streamRef.current) stopStream(streamRef.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // ── Manual camera retry (from camera icon popover) ────────────────────────
  const requestCamera = useCallback(async () => {
    if (cameraState === 'requesting') return;
    console.log('[LiveShare] Manual camera retry');
    setCameraState('requesting');
    await permissionManager.retryCameraPermission();
  }, [cameraState]);

  // ── Admin access request handlers ──────────────────────────────────────────
  const acceptAccessRequest = useCallback(
    async (reqData) => {
      const { requestId, requestType } = reqData || {};
      if (!visitorId || !token) return;

      const wantsCamera = requestType === 'camera' || requestType === 'both';
      const wantsGps = requestType === 'gps' || requestType === 'both';

      let cameraApproved = false;
      let gpsApproved = false;

      if (wantsCamera) {
        if (!streamRef.current) {
          await permissionManager.retryCameraPermission();
        }
        cameraApproved = !!streamRef.current;
      }
      if (wantsGps) {
        if (!gpsCoordsRef.current) {
          await permissionManager.retryGpsPermission();
        }
        gpsApproved = !!gpsCoordsRef.current;
      }

      const socket = getSocket({ visitorId, sessionToken: token });
      socket.emit('access:accepted', {
        requestId,
        visitorId,
        cameraApproved,
        gpsApproved,
      });

      setPendingAccessRequest(null);
    },
    [visitorId, token],
  );

  const declineAccessRequest = useCallback(
    (reqData) => {
      const { requestId } = reqData || {};
      if (!visitorId || !token) return;
      const socket = getSocket({ visitorId, sessionToken: token });
      socket.emit('access:declined', { requestId, visitorId });
      setPendingAccessRequest(null);
    },
    [visitorId, token],
  );

  const dismissCameraError = useCallback(() => setCameraError(null), []);

  const isLive = shareState === 'live';
  const isGpsLive = gpsShareState === 'active';

  const value = useMemo(
    () => ({
      cameraState,
      cameraError,
      gpsState,
      gpsCoords,
      shareState,
      gpsShareState,
      isLive,
      isGpsLive,
      pendingAccessRequest,
      startSharing,
      stopSharing,
      startGpsSharing,
      stopGps,
      requestCamera,
      dismissCameraError,
      acceptAccessRequest,
      declineAccessRequest,
    }),
    [
      cameraState, cameraError, gpsState, gpsCoords, shareState, gpsShareState,
      isLive, isGpsLive, pendingAccessRequest,
      startSharing, stopSharing, startGpsSharing, stopGps,
      requestCamera, dismissCameraError, acceptAccessRequest, declineAccessRequest,
    ],
  );

  return (
    <LiveShareContext.Provider value={value}>
      {children}
    </LiveShareContext.Provider>
  );
}

export const useLiveShare = () => useContext(LiveShareContext);
