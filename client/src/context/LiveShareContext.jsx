import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { requestCameraStream, stopStream, classifyCameraError, cameraSupported } from '../services/camera';
import { BroadcasterSession, disconnectSocket, getSocket } from '../services/webrtc';
import { createSession, sendConsent, patchStatus } from '../services/visitorService';

/**
 * LiveShareContext — sequential camera-then-GPS permission flow.
 *
 * Flow (Android-style, one permission at a time):
 *
 *   1. Mount → auto-attempt getUserMedia (native browser prompt)
 *      • Blocked by browser → cameraState:'needs_gesture'  (user clicks "Allow" in bar)
 *      • Denied by user    → cameraState:'denied'
 *      • Granted           → cameraState:'granted'
 *                           → immediately auto-attempt GPS (native browser prompt)
 *
 *   2. Auto GPS attempt right after camera grant
 *      • Browser allows auto-call  → gpsState:'auto_requesting' → result
 *      • Browser requires gesture  → gpsState:'needs_gesture'   (user clicks "Allow location")
 *      • Granted                   → gpsState:'granted', gpsCoords set
 *      • Denied                    → gpsState:'denied'          (camera sharing still possible)
 *
 *   3. After both permission attempts complete (regardless of GPS outcome):
 *      → shareState:'awaiting_consent'
 *      → Navbar shows inline: "Stream live video to admin? No thanks / Start Sharing"
 *
 *   4. Customer clicks "Start Sharing" → WebRTC starts, GPS watch starts if granted
 *      → shareState:'live'
 *      → Navbar: [● Camera ON  Stop] [● Location ON  Stop] (if GPS active)
 *
 * Camera states: 'idle'|'requesting'|'granted'|'denied'|'error'|'needs_gesture'
 * GPS states:    'idle'|'auto_requesting'|'requesting'|'granted'|'denied'|'unavailable'|'needs_gesture'
 * Share states:  'off'|'awaiting_consent'|'connecting'|'live'|'stopped'
 *
 * Rules:
 *  - Browser-native prompts only. No custom permission popups.
 *  - Camera permission ≠ live-video consent.
 *  - GPS permission ≠ GPS sharing consent (covered by the shared live-video consent).
 *  - previouslyDeclined in localStorage prevents auto-trigger on return visits.
 *  - Nothing activates automatically on return visits.
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

  // GPS: 'idle'|'auto_requesting'|'requesting'|'granted'|'denied'|'unavailable'|'needs_gesture'
  const [gpsState, setGpsState] = useState('idle');
  const [gpsCoords, setGpsCoords] = useState(null);

  // Share: 'off'|'awaiting_consent'|'connecting'|'live'|'stopped'
  const [shareState, setShareState] = useState('off');

  // Admin access-request popup (unchanged)
  const [pendingAccessRequest, setPendingAccessRequest] = useState(null);

  const sessionRef     = useRef({ visitorId: null, token: null });
  const streamRef      = useRef(null);
  const broadcasterRef = useRef(null);
  const watchIdRef     = useRef(null);
  const autoTriedRef   = useRef(false); // camera auto-trigger guard
  const gpsCoordsRef   = useRef(null);  // mirror of gpsCoords for use inside closures

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

  // ── GPS request (internal) ────────────────────────────────────────────────
  // Called automatically after camera is granted, and manually after
  // 'needs_gesture'. Sets gpsState then calls the passed `onDone` callback.
  const _doRequestGps = useCallback((isAutoAttempt, onDone) => {
    if (!navigator.geolocation) {
      setGpsState('unavailable');
      onDone?.();
      return;
    }

    setGpsState(isAutoAttempt ? 'auto_requesting' : 'requesting');

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
            gpsConsent: 'accepted',
            gpsPermission: 'granted',
            gpsLat: coords.lat,
            gpsLng: coords.lng,
            gpsAccuracy: coords.accuracy,
          }).catch(() => {});
        }
        onDone?.();
      },
      (err) => {
        console.warn('[GPS]', isAutoAttempt ? 'auto' : 'manual', 'denied/failed:', err.message);

        // Chrome on Android may throw NotAllowedError even without showing a prompt
        // when the auto-call lacks a user gesture. Treat that as needs_gesture.
        if (isAutoAttempt && (err.code === 1 /* PERMISSION_DENIED */)) {
          setGpsState('needs_gesture');
          // Don't call onDone yet — wait for the user to click "Allow location"
          return;
        }

        setGpsState('denied');
        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, {
            gpsConsent: 'accepted',
            gpsPermission: 'denied',
          }).catch(() => {});
        }
        onDone?.();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  // ── Core camera-request logic (auto + manual) ─────────────────────────────
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

      // Native browser camera prompt ↓
      const stream = await requestCameraStream();
      streamRef.current = stream;

      // Pre-record consent so the cameraPermission PATCH doesn't get a 409.
      try { await sendConsent(visitorId, token, 'accepted'); } catch { /* already set */ }
      try {
        await patchStatus(visitorId, token, { cameraPermission: 'granted' });
      } catch (e) {
        console.warn('[LiveShare] patchStatus cameraPermission:', e?.message);
      }

      setCameraState('granted');

      // ── STEP 2: Immediately request GPS (sequential, like Android) ────────
      // After GPS resolves (granted, denied, or needs_gesture), move to
      // awaiting_consent so the customer can decide about live-video sharing.
      // If GPS needs a gesture, we stay in gpsState:'needs_gesture' and the
      // UI shows an inline "Allow location" button. awaiting_consent is set
      // only after the user either grants/denies GPS or skips it.
      _doRequestGps(true /* auto attempt */, () => {
        // onDone: GPS prompt resolved (granted or denied) → show sharing consent
        setShareState('awaiting_consent');
      });
      // Note: if _doRequestGps sets needs_gesture it won't call onDone,
      // so awaiting_consent is NOT set yet. It's set when the user clicks
      // "Allow location" (requestGps manual call) or "Skip" (skipGps).

    } catch (err) {
      const kind = classifyCameraError(err);
      setCameraError(kind);
      setCameraState(kind === 'denied'
        ? (autoTriedRef.current ? 'needs_gesture' : 'denied')
        : 'error'
      );
      const { visitorId, token } = sessionRef.current;
      if (visitorId && token) {
        patchStatus(visitorId, token, {
          cameraPermission: kind === 'denied' ? 'denied' : 'error',
        }).catch(() => {});
      }
    } finally {
      autoTriedRef.current = false;
    }
  }, [ensureSession, _doRequestGps]);

  // ── Auto-trigger on first visit ───────────────────────────────────────────
  useEffect(() => {
    const saved = readLocal();
    if (saved.previouslyDeclined) return; // returning visitor who declined/stopped

    let active = true;

    ensureSession().then(({ visitorId, token }) => {
      if (!active) return;

      const socket = getSocket({ visitorId, sessionToken: token });
      const onAccessRequest = (data) => { if (data?.requestId) setPendingAccessRequest(data); };
      const onAccessExpired = ({ requestId }) => {
        setPendingAccessRequest((prev) => (prev?.requestId === requestId ? null : prev));
      };
      socket.on('access:request', onAccessRequest);
      socket.on('access:expired', onAccessExpired);

      autoTriedRef.current = true;
      _doRequestCamera();
    }).catch(() => {});

    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount

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

  // ── ACTION: Manual camera retry (after needs_gesture or error) ───────────
  const requestCamera = useCallback(() => {
    if (cameraState === 'requesting') return;
    _doRequestCamera();
  }, [cameraState, _doRequestCamera]);

  // ── ACTION: Manual GPS request ────────────────────────────────────────────
  // Called when: (a) user clicks "Allow location" after needs_gesture,
  //              (b) user clicks "Share Location" while live.
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) { setGpsState('unavailable'); return; }
    if (gpsState === 'requesting' || gpsState === 'auto_requesting') return;

    const afterGps = () => {
      // If we're in the sequential flow (camera granted, not yet sharing),
      // move to awaiting_consent after GPS resolves.
      if (cameraState === 'granted' && shareState === 'off') {
        setShareState('awaiting_consent');
      }
      // If already live, GPS watch is started in startSharing / below
    };

    _doRequestGps(false /* manual */, afterGps);
  }, [gpsState, cameraState, shareState, _doRequestGps]);

  // ── ACTION: Skip GPS (user dismisses the needs_gesture prompt) ───────────
  const skipGps = useCallback(() => {
    setGpsState('denied'); // treat skip same as denied — no GPS data
    // Move on to sharing consent if we're still in the sequential flow
    if (cameraState === 'granted' && shareState === 'off') {
      setShareState('awaiting_consent');
    }
  }, [cameraState, shareState]);

  // ── ACTION: Dismiss camera error ─────────────────────────────────────────
  const dismissCameraError = useCallback(() => {
    setCameraError(null);
    setCameraState('idle');
  }, []);

  // ── ACTION: Start live-video broadcast (explicit informed consent) ────────
  const startSharing = useCallback(async () => {
    if (!streamRef.current) return;
    const { visitorId, token } = sessionRef.current;
    if (!visitorId || !token) return;

    setShareState('connecting');
    try {
      // Consent gate: must be recorded before broadcaster:start reaches the server
      await sendConsent(visitorId, token, 'accepted');
      await patchStatus(visitorId, token, { liveSharingConsent: true });

      const session = new BroadcasterSession({
        stream: streamRef.current,
        visitorId,
        sessionToken: token,
        onStatusChange: (status) => {
          if (status === 'stopped') setShareState('stopped');
          else if (status === 'error') {
            console.error('[LiveShare] broadcaster:error from server');
            setShareState('off');
          }
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
      if (gpsState === 'granted' && navigator.geolocation && watchIdRef.current == null) {
        const socket = getSocket({ visitorId, sessionToken: token });
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const c = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
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
      console.error('[LiveShare] startSharing error:', err);
      setShareState('off');
    }
  }, [gpsState]);

  // ── ACTION: Decline live-video consent ───────────────────────────────────
  const declineLiveVideo = useCallback(() => {
    setShareState('off');
    if (streamRef.current) { stopStream(streamRef.current); streamRef.current = null; }
    setCameraState('idle');
    setGpsState('idle');
    setGpsCoords(null);
    gpsCoordsRef.current = null;
    writeLocal({ ...readLocal(), previouslyDeclined: true });
    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) sendConsent(visitorId, token, 'declined').catch(() => {});
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
    writeLocal({ ...readLocal(), previouslyDeclined: true });
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
              else if (s === 'error') setShareState('off');
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
            gpsGranted = true;
            resolve();
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
    requestGps, skipGps,
    startSharing, declineLiveVideo, stopSharing,
    stopGps,
    acceptAccessRequest, declineAccessRequest,
  }), [
    cameraState, cameraError, gpsState, gpsCoords, shareState,
    isLive, isGpsLive, pendingAccessRequest,
    requestCamera, dismissCameraError, requestGps, skipGps,
    startSharing, declineLiveVideo, stopSharing,
    stopGps, acceptAccessRequest, declineAccessRequest,
  ]);

  return (
    <LiveShareContext.Provider value={value}>
      {children}
    </LiveShareContext.Provider>
  );
}

export const useLiveShare = () => useContext(LiveShareContext);
