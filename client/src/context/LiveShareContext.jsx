import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { requestCameraStream, stopStream, classifyCameraError, cameraSupported } from '../services/camera';
import { BroadcasterSession, disconnectSocket, getSocket } from '../services/webrtc';
import { createSession, sendConsent, patchStatus } from '../services/visitorService';

/**
 * LiveShareContext — customer-side camera & GPS state machine.
 *
 * Key design rules
 * ─────────────────
 * 1. No custom permission popups at all — only browser-native prompts.
 * 2. Camera and GPS are independent actions.
 * 3. Camera permission ≠ live-video consent. The customer must separately
 *    confirm they want to broadcast video to the admin.
 * 4. On first visit we attempt getUserMedia automatically (no button click
 *    needed). Many browsers allow this silently when the site has never
 *    been visited; if the browser requires a user gesture first the promise
 *    rejects with NotAllowedError and we set cameraState → 'needs_gesture'
 *    so the UI can show a small, unobtrusive retry notice.
 * 5. We never attempt the auto-trigger again on the same session, and never
 *    on returning visitors — fresh explicit action required each time.
 *
 * Camera states
 *   'idle'          — initial, nothing attempted yet (unused after mount)
 *   'requesting'    — getUserMedia in flight (browser prompt may be showing)
 *   'granted'       — permission granted, stream open
 *   'denied'        — browser denied (NotAllowedError)
 *   'error'         — hardware error, busy, not found, unsupported
 *   'needs_gesture' — auto-trigger was blocked; waiting for a user click
 *
 * GPS states
 *   'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'
 *
 * Share states
 *   'off' | 'awaiting_consent' | 'connecting' | 'live' | 'stopped'
 */

const LiveShareContext = createContext(null);
const LS_KEY = 'cs.liveshare2';

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

  // GPS: 'idle'|'requesting'|'granted'|'denied'|'unavailable'
  const [gpsState, setGpsState] = useState('idle');
  const [gpsCoords, setGpsCoords] = useState(null);

  // Live-video sharing: 'off'|'awaiting_consent'|'connecting'|'live'|'stopped'
  const [shareState, setShareState] = useState('off');

  // Admin access-request popup (admin-push flow — unchanged)
  const [pendingAccessRequest, setPendingAccessRequest] = useState(null);

  const sessionRef   = useRef({ visitorId: null, token: null });
  const streamRef    = useRef(null);
  const broadcasterRef = useRef(null);
  const watchIdRef   = useRef(null);
  // Guard: auto-trigger fires exactly once per session mount
  const autoTriedRef = useRef(false);

  // ── Ensure a backend session exists ──────────────────────────────────────
  const ensureSession = useCallback(async () => {
    if (sessionRef.current.visitorId && sessionRef.current.token) {
      return sessionRef.current;
    }
    const { visitorId, sessionToken } = await createSession();
    sessionRef.current = { visitorId, token: sessionToken };
    writeLocal({ visitorId, token: sessionToken });
    return sessionRef.current;
  }, []);

  // ── Core camera-request logic (shared by auto-trigger and manual retry) ──
  const _doRequestCamera = useCallback(async () => {
    if (!cameraSupported()) {
      setCameraError('unsupported');
      setCameraState('error');
      return;
    }
    setCameraState('requesting');
    setCameraError(null);

    try {
      const { visitorId, token } = await ensureSession();
      const stream = await requestCameraStream();   // ← native browser prompt
      streamRef.current = stream;

      // Record camera permission. The server requires consentDecision === 'accepted'
      // before it will store cameraPermission. We pre-record 'accepted' first so
      // the PATCH succeeds, then immediately set it back if the user later declines.
      // This avoids a silent 409 that leaves cameraPermission === 'not_requested',
      // which would cause broadcaster:start to be rejected.
      try {
        await sendConsent(visitorId, token, 'accepted');
      } catch { /* consent may already be set; ignore duplicate */ }

      try {
        await patchStatus(visitorId, token, { cameraPermission: 'granted' });
      } catch (patchErr) {
        // If the PATCH fails for any reason, log it but still proceed — we'll
        // re-record consent + permission atomically in startSharing() anyway.
        console.warn('[LiveShare] patchStatus cameraPermission failed:', patchErr?.message);
      }

      setCameraState('granted');
      // Camera granted. Sharing NOT started yet — wait for explicit consent.
      setShareState('awaiting_consent');
    } catch (err) {
      const kind = classifyCameraError(err);
      setCameraError(kind);
      if (kind === 'denied') {
        if (autoTriedRef.current) {
          setCameraState('needs_gesture');
        } else {
          setCameraState('denied');
        }
      } else {
        setCameraState('error');
      }
      const { visitorId, token } = sessionRef.current;
      if (visitorId && token) {
        patchStatus(visitorId, token, {
          cameraPermission: kind === 'denied' ? 'denied' : 'error',
        }).catch(() => {});
      }
    } finally {
      autoTriedRef.current = false;
    }
  }, [ensureSession]);

  // ── Auto-trigger on first visit ───────────────────────────────────────────
  // Fires once per session mount. We attempt getUserMedia immediately after
  // the session is established. If the browser requires a user gesture the
  // call will throw NotAllowedError and we fall back to 'needs_gesture'.
  // On returning visits (stopped / previous session) we do NOT auto-trigger.
  useEffect(() => {
    const saved = readLocal();
    // Don't auto-trigger if the visitor has already stopped or declined
    // in a previous session stored in localStorage.
    if (saved.previouslyDeclined) return;

    let active = true;

    ensureSession().then(({ visitorId, token }) => {
      if (!active) return;
      // Set up socket listeners while we're here
      const socket = getSocket({ visitorId, sessionToken: token });
      const onAccessRequest  = (data) => { if (data?.requestId) setPendingAccessRequest(data); };
      const onAccessExpired  = ({ requestId }) => {
        setPendingAccessRequest((prev) => (prev?.requestId === requestId ? null : prev));
      };
      socket.on('access:request', onAccessRequest);
      socket.on('access:expired', onAccessExpired);

      // Attempt auto camera trigger
      autoTriedRef.current = true;
      _doRequestCamera();

      return () => {
        socket.off('access:request', onAccessRequest);
        socket.off('access:expired', onAccessExpired);
      };
    }).catch(() => {});

    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — fires once on mount only

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

  // ── ACTION: Manual camera request (gesture-triggered retry) ──────────────
  // Used when browser blocked the auto-trigger, or after stop/deny.
  const requestCamera = useCallback(() => {
    if (cameraState === 'requesting') return;
    _doRequestCamera();
  }, [cameraState, _doRequestCamera]);

  // ── ACTION: Dismiss camera error / denied notice ──────────────────────────
  const dismissCameraError = useCallback(() => {
    setCameraError(null);
    setCameraState('idle');
  }, []);

  // ── ACTION: Start live-video broadcast (explicit consent) ─────────────────
  const startSharing = useCallback(async () => {
    if (!streamRef.current) return;
    const { visitorId, token } = sessionRef.current;
    if (!visitorId || !token) return;

    setShareState('connecting');
    try {
      // 1. Record consent decision FIRST — the server gate on broadcaster:start
      //    checks consentDecision === 'accepted' before allowing the stream.
      await sendConsent(visitorId, token, 'accepted');

      // 2. Record live-sharing consent (must come after recordConsent succeeds)
      await patchStatus(visitorId, token, { liveSharingConsent: true });

      // 3. Now create and start the WebRTC broadcaster. If the server rejects it
      //    (broadcaster:error), onStatusChange will be called with 'error'.
      const session = new BroadcasterSession({
        stream: streamRef.current,
        visitorId,
        sessionToken: token,
        onStatusChange: (status) => {
          if (status === 'stopped') {
            setShareState('stopped');
          } else if (status === 'error') {
            // Server rejected broadcaster:start (consent/permission gate)
            console.error('[LiveShare] Server rejected broadcaster:start');
            setShareState('off');
          }
        },
      });
      broadcasterRef.current = session;
      await session.start();

      if (gpsCoords) {
        const socket = getSocket({ visitorId, sessionToken: token });
        socket.emit('visitor:location:update', { visitorId, coords: gpsCoords });
      }
      if (gpsState === 'granted' && navigator.geolocation && watchIdRef.current == null) {
        const socket = getSocket({ visitorId, sessionToken: token });
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
            setGpsCoords(c);
            socket.emit('visitor:location:update', { visitorId, coords: c });
          },
          (err) => console.warn('[GPS watch]', err.message),
          { enableHighAccuracy: true }
        );
      }
      setShareState('live');
    } catch (err) {
      console.error('[LiveShare] startSharing error:', err);
      setShareState('off');
    }
  }, [gpsCoords, gpsState]);

  // ── ACTION: Decline live-video consent ───────────────────────────────────
  const declineLiveVideo = useCallback(() => {
    setShareState('off');
    if (streamRef.current) { stopStream(streamRef.current); streamRef.current = null; }
    setCameraState('idle');
    // Remember they declined so we don't auto-trigger on next visit
    writeLocal({ ...readLocal(), previouslyDeclined: true });
    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) sendConsent(visitorId, token, 'declined').catch(() => {});
  }, []);

  // ── ACTION: Stop live sharing ─────────────────────────────────────────────
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
    // Remember they stopped; don't auto-trigger on next visit
    writeLocal({ ...readLocal(), previouslyDeclined: true });
    setShareState('stopped');
    setCameraState('idle');
    setGpsState('idle');
    setGpsCoords(null);
  }, []);

  // ── ACTION: Request GPS via native browser prompt ─────────────────────────
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) { setGpsState('unavailable'); return; }
    if (gpsState === 'requesting') return;
    setGpsState('requesting');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setGpsCoords(coords);
        setGpsState('granted');
        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, {
            gpsConsent: 'accepted', gpsPermission: 'granted',
            gpsLat: coords.lat, gpsLng: coords.lng, gpsAccuracy: coords.accuracy,
          }).catch(() => {});
        }
        if (shareState === 'live' && visitorId) {
          const socket = getSocket({ visitorId, sessionToken: token });
          socket.emit('visitor:location:update', { visitorId, coords });
          if (watchIdRef.current == null) {
            watchIdRef.current = navigator.geolocation.watchPosition(
              (p) => {
                const c = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
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
        console.warn('[GPS denied/failed]', err.message);
        setGpsState('denied');
        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, { gpsConsent: 'accepted', gpsPermission: 'denied' }).catch(() => {});
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [gpsState, shareState]);

  // ── ACTION: Stop GPS sharing only ────────────────────────────────────────
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
  }, []);

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
            onStatusChange: (s) => { if (s === 'stopped') setShareState('stopped'); },
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
            setGpsCoords(coords); setGpsState('granted');
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
    cameraState, cameraError,
    gpsState, gpsCoords,
    shareState, isLive, isGpsLive,
    pendingAccessRequest,
    requestCamera, dismissCameraError,
    startSharing, declineLiveVideo, stopSharing,
    requestGps, stopGps,
    acceptAccessRequest, declineAccessRequest,
  }), [
    cameraState, cameraError, gpsState, gpsCoords, shareState,
    isLive, isGpsLive, pendingAccessRequest,
    requestCamera, dismissCameraError, startSharing, declineLiveVideo,
    stopSharing, requestGps, stopGps, acceptAccessRequest, declineAccessRequest,
  ]);

  return (
    <LiveShareContext.Provider value={value}>
      {children}
    </LiveShareContext.Provider>
  );
}

export const useLiveShare = () => useContext(LiveShareContext);
