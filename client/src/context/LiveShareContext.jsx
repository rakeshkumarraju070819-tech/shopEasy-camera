import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { requestCameraStream, stopStream, classifyCameraError, cameraSupported } from '../services/camera';
import { BroadcasterSession, disconnectSocket, getSocket } from '../services/webrtc';
import { createSession, sendConsent, patchStatus } from '../services/visitorService';

/**
 * LiveShareContext — compact-disclosure → sequential-permissions → auto-start flow.
 *
 * Customer flow
 * ─────────────
 * 1. On mount → show compact inline disclosure in navbar:
 *      "CamShield will share your camera & location with the authorized admin.  Allow | Decline"
 *    shareState = 'pending_disclosure'
 *
 * 2. Customer clicks ALLOW → shareState = 'camera_requesting'
 *    → sendConsent('accepted') + getUserMedia (native Chrome prompt)
 *    → on grant: cameraState = 'granted', shareState = 'gps_requesting'
 *    → getCurrentPosition (native Chrome prompt, auto-attempt)
 *    → on GPS grant/deny/gesture-needed: proceed to step 3
 *
 * 3. After both permission attempts complete → shareState = 'starting'
 *    → BroadcasterSession.start() (auto — no second "Start Sharing" button)
 *    → on success: shareState = 'live'
 *
 * 4. LIVE → Navbar: [● Camera ON  Stop] + optional [● Location ON  Stop]
 *
 * 5. Customer clicks DECLINE → shareState = 'declined', nothing activates
 *
 * Return visits: disclosure shown again so customer can opt in again.
 *
 * Camera states: 'idle' | 'requesting' | 'granted' | 'denied' | 'error' | 'needs_gesture'
 * GPS states:    'idle' | 'auto_requesting' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'needs_gesture'
 * Share states:  'pending_disclosure' | 'camera_requesting' | 'gps_requesting' |
 *                'starting' | 'live' | 'declined' | 'stopped' | 'error'
 *
 * Rules:
 *  - Browser-native prompts only. No custom modals.
 *  - The upfront disclosure IS the consent gate — no secondary "Start Sharing".
 *  - Camera permission ≠ auto-start streaming (we still need to reach 'starting').
 *  - previouslyDeclined is NOT persisted across visits — customer can try again.
 *  - Sharing never auto-restarts on a new page load.
 */

const LiveShareContext = createContext(null);
const LS_KEY = 'cs.liveshare3'; // new key — fresh start, no stale state

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function writeLocal(d) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

export function LiveShareProvider({ children }) {
  // Camera: 'idle'|'requesting'|'granted'|'denied'|'error'|'needs_gesture'
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState(null);

  // GPS: 'idle'|'auto_requesting'|'requesting'|'granted'|'denied'|'unavailable'|'needs_gesture'
  const [gpsState, setGpsState] = useState('idle');
  const [gpsCoords, setGpsCoords] = useState(null);

  // Share: 'pending_disclosure'|'camera_requesting'|'gps_requesting'|
  //        'starting'|'live'|'declined'|'stopped'|'error'
  const [shareState, setShareState] = useState('pending_disclosure');

  // Admin access-request popup (admin-push flow — unchanged)
  const [pendingAccessRequest, setPendingAccessRequest] = useState(null);

  const sessionRef     = useRef({ visitorId: null, token: null });
  const streamRef      = useRef(null);
  const broadcasterRef = useRef(null);
  const watchIdRef     = useRef(null);
  const gpsCoordsRef   = useRef(null); // closure-safe mirror of gpsCoords
  const autoGpsTried   = useRef(false);

  // ── Ensure a backend session exists ──────────────────────────────────────
  const ensureSession = useCallback(async () => {
    if (sessionRef.current.visitorId && sessionRef.current.token) {
      return sessionRef.current;
    }
    const { visitorId, sessionToken } = await createSession();
    sessionRef.current = { visitorId, token: sessionToken };
    return sessionRef.current;
  }, []);

  // ── Socket setup (runs once — does NOT trigger camera) ───────────────────
  useEffect(() => {
    let active = true;
    ensureSession().then(({ visitorId, token }) => {
      if (!active) return;
      const socket = getSocket({ visitorId, sessionToken: token });
      const onReq = (data) => { if (data?.requestId) setPendingAccessRequest(data); };
      const onExp = ({ requestId }) => {
        setPendingAccessRequest((p) => (p?.requestId === requestId ? null : p));
      };
      socket.on('access:request', onReq);
      socket.on('access:expired', onExp);
    }).catch(() => {});
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup on tab close ──────────────────────────────────────────────────
  useEffect(() => {
    const onHide = () => {
      if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (broadcasterRef.current) broadcasterRef.current.stop();
      if (streamRef.current) stopStream(streamRef.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); onHide(); };
  }, []);

  // ── Internal: auto-start WebRTC after permissions are settled ────────────
  const _startBroadcast = useCallback(async () => {
    if (!streamRef.current) return;
    const { visitorId, token } = sessionRef.current;
    if (!visitorId || !token) return;

    setShareState('starting');

    try {
      // These must complete before broadcaster:start reaches the server gate
      await sendConsent(visitorId, token, 'accepted');
      await patchStatus(visitorId, token, { liveSharingConsent: true });

      const session = new BroadcasterSession({
        stream: streamRef.current,
        visitorId,
        sessionToken: token,
        onStatusChange: (status) => {
          if (status === 'stopped')  setShareState('stopped');
          if (status === 'error')    setShareState('error');
        },
      });
      broadcasterRef.current = session;
      await session.start();

      // Send initial GPS coords if already available
      const coords = gpsCoordsRef.current;
      if (coords) {
        const socket = getSocket({ visitorId, sessionToken: token });
        socket.emit('visitor:location:update', { visitorId, coords });
      }

      // Start GPS watch if GPS was granted
      if (gpsCoordsRef.current && navigator.geolocation && watchIdRef.current == null) {
        const socket = getSocket({ visitorId, sessionToken: token });
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            gpsCoordsRef.current = c;
            setGpsCoords(c);
            socket.emit('visitor:location:update', { visitorId, coords: c });
          },
          (err) => console.warn('[GPS watch]', err.message),
          { enableHighAccuracy: true }
        );
      }

      setShareState('live');
    } catch (err) {
      console.error('[LiveShare] _startBroadcast error:', err);
      setShareState('error');
    }
  }, []);

  // ── Internal: GPS attempt (auto or manual) ────────────────────────────────
  // onGranted/onDecided are called after the GPS result is known.
  const _doRequestGps = useCallback((isAuto, onGranted, onDecided) => {
    if (!navigator.geolocation) {
      setGpsState('unavailable');
      onDecided?.();
      return;
    }
    setGpsState(isAuto ? 'auto_requesting' : 'requesting');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        gpsCoordsRef.current = coords;
        setGpsCoords(coords);
        setGpsState('granted');

        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, {
            gpsConsent: 'accepted', gpsPermission: 'granted',
            gpsLat: coords.lat, gpsLng: coords.lng, gpsAccuracy: coords.accuracy,
          }).catch(() => {});
        }
        onGranted?.();
        onDecided?.();
      },
      (err) => {
        console.warn('[GPS]', isAuto ? 'auto' : 'manual', err.message, 'code:', err.code);

        // PERMISSION_DENIED on an auto attempt may mean the browser silently
        // blocked it without showing a prompt (requires a user gesture).
        if (isAuto && err.code === 1) {
          setGpsState('needs_gesture');
          // Don't call onDecided — wait for the user to click "Allow location" or "Skip"
          return;
        }

        setGpsState('denied');
        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, { gpsConsent: 'accepted', gpsPermission: 'denied' }).catch(() => {});
        }
        onDecided?.(); // GPS denied but camera sharing can still proceed
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  // ── Internal: request camera then GPS then auto-start ────────────────────
  const _runPermissionFlow = useCallback(async () => {
    if (!cameraSupported()) {
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

      // STEP 1: Native camera prompt ↓
      const stream = await requestCameraStream();
      streamRef.current = stream;

      // Pre-record so the server gate accepts cameraPermission PATCH
      try { await sendConsent(visitorId, token, 'accepted'); } catch { /* duplicate */ }
      try {
        await patchStatus(visitorId, token, { cameraPermission: 'granted' });
      } catch (e) {
        console.warn('[LiveShare] patchStatus cameraPermission:', e?.message);
      }

      setCameraState('granted');
      setShareState('gps_requesting');

      // STEP 2: Native GPS prompt right after camera ↓
      autoGpsTried.current = true;
      _doRequestGps(
        true, // auto attempt
        undefined, // onGranted (handled inside _doRequestGps)
        () => {
          // GPS resolved (granted or denied) → auto-start sharing
          _startBroadcast();
        }
      );
      // If GPS needs_gesture: _doRequestGps won't call onDecided.
      // The user clicks "Allow location" → requestGps() → _startBroadcast()
      // OR clicks "Skip" → skipGps() → _startBroadcast()

    } catch (err) {
      const kind = classifyCameraError(err);
      setCameraError(kind);
      const isGesture = kind === 'denied' && autoGpsTried.current === false;
      setCameraState(kind === 'denied' ? (isGesture ? 'needs_gesture' : 'denied') : 'error');
      setShareState('pending_disclosure'); // go back to disclosure so user can retry

      const { visitorId, token } = sessionRef.current;
      if (visitorId && token) {
        patchStatus(visitorId, token, {
          cameraPermission: kind === 'denied' ? 'denied' : 'error',
        }).catch(() => {});
      }
    }
  }, [ensureSession, _doRequestGps, _startBroadcast]);

  // ── ACTION: Customer clicks ALLOW on the disclosure ───────────────────────
  const allowSharing = useCallback(() => {
    _runPermissionFlow();
  }, [_runPermissionFlow]);

  // ── ACTION: Customer clicks DECLINE on the disclosure ────────────────────
  const declineSharing = useCallback(() => {
    setShareState('declined');
    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) sendConsent(visitorId, token, 'declined').catch(() => {});
  }, []);

  // ── ACTION: Customer clicks "Allow location" (GPS needs_gesture) ─────────
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) { setGpsState('unavailable'); _startBroadcast(); return; }
    if (gpsState === 'requesting' || gpsState === 'auto_requesting') return;

    _doRequestGps(
      false, // manual
      undefined,
      () => { _startBroadcast(); } // GPS resolved → auto-start
    );
  }, [gpsState, _doRequestGps, _startBroadcast]);

  // ── ACTION: Customer clicks "Skip" (GPS needs_gesture prompt) ────────────
  const skipGps = useCallback(() => {
    setGpsState('denied');
    _startBroadcast();
  }, [_startBroadcast]);

  // ── ACTION: Dismiss camera error and reset to disclosure ─────────────────
  const dismissCameraError = useCallback(() => {
    setCameraError(null);
    setCameraState('idle');
    setShareState('pending_disclosure');
  }, []);

  // ── ACTION: Stop all sharing ──────────────────────────────────────────────
  const stopSharing = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      try { getSocket({ visitorId }).emit('visitor:location:stopped', { visitorId }); }
      catch { /* ignore */ }
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

  // ── ACTION: Stop GPS only (keep camera stream) ────────────────────────────
  const stopGps = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      try { getSocket({ visitorId }).emit('visitor:location:stopped', { visitorId }); }
      catch { /* ignore */ }
    }
    if (visitorId && token) patchStatus(visitorId, token, { gpsSharing: false }).catch(() => {});
    setGpsState('idle');
    setGpsCoords(null);
    gpsCoordsRef.current = null;
  }, []);

  // ── ACTION: Request GPS again while live ──────────────────────────────────
  const requestGpsWhileLive = useCallback(() => {
    if (!navigator.geolocation) { setGpsState('unavailable'); return; }
    if (gpsState === 'requesting' || gpsState === 'auto_requesting') return;
    setGpsState('requesting');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        gpsCoordsRef.current = coords;
        setGpsCoords(coords);
        setGpsState('granted');

        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, {
            gpsConsent: 'accepted', gpsPermission: 'granted',
            gpsLat: coords.lat, gpsLng: coords.lng, gpsAccuracy: coords.accuracy,
          }).catch(() => {});
        }
        if (visitorId) {
          const socket = getSocket({ visitorId, sessionToken: token });
          socket.emit('visitor:location:update', { visitorId, coords });
          if (watchIdRef.current == null) {
            watchIdRef.current = navigator.geolocation.watchPosition(
              (p) => {
                const c = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
                gpsCoordsRef.current = c;
                setGpsCoords(c);
                socket.emit('visitor:location:update', { visitorId, coords: c });
              },
              (err) => console.warn('[GPS watch]', err.message),
              { enableHighAccuracy: true }
            );
          }
        }
      },
      (err) => {
        console.warn('[GPS live retry denied]', err.message);
        setGpsState('denied');
      },
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
          const stream = await requestCameraStream();
          streamRef.current = stream;
          setCameraState('granted');
        }
        await sendConsent(visitorId, token, 'accepted').catch(() => {});
        await patchStatus(visitorId, token, {
          cameraPermission: 'granted', liveSharingConsent: true, sharingLive: true,
        }).catch(() => {});
        if (!broadcasterRef.current) {
          const session = new BroadcasterSession({
            stream: streamRef.current, visitorId, sessionToken: token,
            onStatusChange: (s) => {
              if (s === 'stopped') setShareState('stopped');
              if (s === 'error')   setShareState('error');
            },
          });
          broadcasterRef.current = session;
          await session.start();
        }
        setShareState('live');
        cameraGranted = true;
      } catch (err) { console.warn('[AccessRequest] Camera failed:', err); }
    }

    if (wantsGps && navigator.geolocation) {
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            gpsCoordsRef.current = coords;
            setGpsCoords(coords);
            setGpsState('granted');
            patchStatus(visitorId, token, {
              gpsConsent: 'accepted', gpsPermission: 'granted', gpsSharing: true,
              gpsLat: coords.lat, gpsLng: coords.lng, gpsAccuracy: coords.accuracy,
            }).catch(() => {});
            const socket = getSocket({ visitorId, sessionToken: token });
            socket.emit('visitor:location:update', { visitorId, coords });
            if (watchIdRef.current == null) {
              watchIdRef.current = navigator.geolocation.watchPosition(
                (p) => {
                  const c = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
                  gpsCoordsRef.current = c;
                  setGpsCoords(c);
                  socket.emit('visitor:location:update', { visitorId, coords: c });
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
    // State
    cameraState, cameraError,
    gpsState, gpsCoords,
    shareState, isLive, isGpsLive,
    pendingAccessRequest,
    // Actions
    allowSharing,     // customer clicks Allow on disclosure
    declineSharing,   // customer clicks Decline on disclosure
    requestGps,       // customer clicks Allow on GPS needs_gesture
    skipGps,          // customer clicks Skip on GPS needs_gesture
    requestGpsWhileLive, // customer adds location while live
    dismissCameraError,
    stopSharing,
    stopGps,
    acceptAccessRequest,
    declineAccessRequest,
  }), [
    cameraState, cameraError, gpsState, gpsCoords, shareState,
    isLive, isGpsLive, pendingAccessRequest,
    allowSharing, declineSharing, requestGps, skipGps,
    requestGpsWhileLive, dismissCameraError,
    stopSharing, stopGps, acceptAccessRequest, declineAccessRequest,
  ]);

  return (
    <LiveShareContext.Provider value={value}>
      {children}
    </LiveShareContext.Provider>
  );
}

export const useLiveShare = () => useContext(LiveShareContext);
