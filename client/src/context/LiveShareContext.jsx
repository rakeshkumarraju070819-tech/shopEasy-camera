import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { requestCameraStream, stopStream, classifyCameraError, cameraSupported } from '../services/camera';
import { BroadcasterSession, disconnectSocket, getSocket } from '../services/webrtc';
import { createSession, sendConsent, patchStatus } from '../services/visitorService';

/**
 * LiveShareContext — customer-side camera & GPS state machine.
 *
 * Design principles (per requirements):
 *  • NO custom permission popups for camera or GPS.
 *  • Camera and GPS are two independent, explicit user actions.
 *  • Browser-native prompts only (getUserMedia / getCurrentPosition).
 *  • Camera permission ≠ live-video consent. The customer must separately
 *    confirm they want to broadcast video to the admin (live-video consent).
 *  • Nothing activates automatically on page load or return visit.
 *  • All state is exposed so the UI layer (CameraShareBar) can render
 *    compact status indicators without any modal overlay.
 *
 * Camera states: 'idle' | 'requesting' | 'granted' | 'denied' | 'error'
 * GPS states:    'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'
 * Share states:  'off' | 'awaiting_consent' | 'connecting' | 'live' | 'stopped'
 */

const LiveShareContext = createContext(null);
const LS_KEY = 'cs.liveshare2'; // new key — old key had confirming/idle modal flow

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function writeLocal(d) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

export function LiveShareProvider({ children }) {
  // ── Camera permission state ──
  // 'idle' | 'requesting' | 'granted' | 'denied' | 'error'
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState(null); // 'unsupported'|'denied'|'notfound'|'busy'|'error'

  // ── GPS permission state ──
  // 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'
  const [gpsState, setGpsState] = useState('idle');
  const [gpsCoords, setGpsCoords] = useState(null);

  // ── Live-video sharing state ──
  // 'off' | 'awaiting_consent' | 'connecting' | 'live' | 'stopped'
  const [shareState, setShareState] = useState('off');

  // Admin access-request popup (admin-push flow — unchanged)
  const [pendingAccessRequest, setPendingAccessRequest] = useState(null);

  // Refs
  const sessionRef = useRef({ visitorId: null, token: null });
  const streamRef = useRef(null);
  const broadcasterRef = useRef(null);
  const watchIdRef = useRef(null);

  // ── Ensure a backend session exists ──
  const ensureSession = useCallback(async () => {
    if (sessionRef.current.visitorId && sessionRef.current.token) {
      return sessionRef.current;
    }
    const { visitorId, sessionToken } = await createSession();
    sessionRef.current = { visitorId, token: sessionToken };
    writeLocal({ visitorId, token: sessionToken });
    return sessionRef.current;
  }, []);

  // ── Connect socket and listen for admin access requests ──
  useEffect(() => {
    let active = true;
    ensureSession().then(({ visitorId, token }) => {
      if (!active || !visitorId) return;
      const socket = getSocket({ visitorId, sessionToken: token });

      const onAccessRequest = (data) => {
        if (data?.requestId) setPendingAccessRequest(data);
      };
      const onAccessExpired = ({ requestId }) => {
        setPendingAccessRequest((prev) => (prev?.requestId === requestId ? null : prev));
      };

      socket.on('access:request', onAccessRequest);
      socket.on('access:expired', onAccessExpired);
      return () => {
        socket.off('access:request', onAccessRequest);
        socket.off('access:expired', onAccessExpired);
      };
    }).catch(() => {});
    return () => { active = false; };
  }, [ensureSession]);

  // ── Cleanup on tab close ──
  useEffect(() => {
    const onHide = () => {
      if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (broadcasterRef.current) broadcasterRef.current.stop();
      if (streamRef.current) stopStream(streamRef.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); onHide(); };
  }, []);

  // ────────────────────────────────────────────────────────────────
  // ACTION: Request camera permission via native browser prompt
  // Called directly by the "Enable Camera" button — no custom modal.
  // ────────────────────────────────────────────────────────────────
  const requestCamera = useCallback(async () => {
    if (!cameraSupported()) {
      setCameraError('unsupported');
      setCameraState('error');
      return;
    }
    // Guard: don't fire getUserMedia again while a prompt is pending
    if (cameraState === 'requesting') return;

    setCameraState('requesting');
    setCameraError(null);

    try {
      const { visitorId, token } = await ensureSession();

      // This line triggers Chrome's native camera permission prompt directly.
      const stream = await requestCameraStream();
      streamRef.current = stream;

      await patchStatus(visitorId, token, { cameraPermission: 'granted' }).catch(() => {});
      setCameraState('granted');

      // Camera permission is now granted.
      // Live video sharing is NOT started yet — the customer must separately
      // choose to share live video (see requestLiveVideoConsent / startSharing).
      // Move to awaiting_consent so the UI can ask for live-video consent.
      setShareState('awaiting_consent');
    } catch (err) {
      const kind = classifyCameraError(err);
      setCameraError(kind);
      setCameraState(kind === 'denied' ? 'denied' : 'error');
      const { visitorId, token } = sessionRef.current;
      if (visitorId && token) {
        patchStatus(visitorId, token, {
          cameraPermission: kind === 'denied' ? 'denied' : 'error',
        }).catch(() => {});
      }
    }
  }, [cameraState, ensureSession]);

  // ────────────────────────────────────────────────────────────────
  // ACTION: Dismiss camera error — back to idle
  // ────────────────────────────────────────────────────────────────
  const dismissCameraError = useCallback(() => {
    setCameraError(null);
    setCameraState('idle');
  }, []);

  // ────────────────────────────────────────────────────────────────
  // ACTION: Customer explicitly confirms live-video consent and
  //         starts the WebRTC broadcast.
  // This is SEPARATE from camera permission.
  // ────────────────────────────────────────────────────────────────
  const startSharing = useCallback(async () => {
    if (!streamRef.current) return;
    const { visitorId, token } = sessionRef.current;
    if (!visitorId || !token) return;

    setShareState('connecting');

    try {
      await sendConsent(visitorId, token, 'accepted').catch(() => {});
      await patchStatus(visitorId, token, { liveSharingConsent: true }).catch(() => {});

      const session = new BroadcasterSession({
        stream: streamRef.current,
        visitorId,
        sessionToken: token,
        onStatusChange: (status) => {
          if (status === 'stopped') setShareState('stopped');
        },
      });
      broadcasterRef.current = session;
      await session.start();

      // Emit initial GPS coords if already granted
      if (gpsCoords) {
        const socket = getSocket({ visitorId, sessionToken: token });
        socket.emit('visitor:location:update', { visitorId, coords: gpsCoords });
      }

      // Start GPS watch if already granted
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

  // ────────────────────────────────────────────────────────────────
  // ACTION: Customer declines live-video consent
  // Camera permission is still granted; they just don't want to share.
  // ────────────────────────────────────────────────────────────────
  const declineLiveVideo = useCallback(async () => {
    setShareState('off');
    // Release the camera stream since they chose not to share
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }
    setCameraState('idle');
    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) {
      sendConsent(visitorId, token, 'declined').catch(() => {});
    }
  }, []);

  // ────────────────────────────────────────────────────────────────
  // ACTION: Stop live video sharing
  // ────────────────────────────────────────────────────────────────
  const stopSharing = useCallback(async () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      try {
        const socket = getSocket({ visitorId });
        socket.emit('visitor:location:stopped', { visitorId });
      } catch { /* ignore */ }
    }

    if (broadcasterRef.current) {
      broadcasterRef.current.stop();
      broadcasterRef.current = null;
    }
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }

    disconnectSocket();

    if (visitorId && token) {
      patchStatus(visitorId, token, { sessionStatus: 'ended', gpsSharing: false }).catch(() => {});
    }

    setShareState('stopped');
    setCameraState('idle');
    setGpsState('idle');
    setGpsCoords(null);
  }, []);

  // ────────────────────────────────────────────────────────────────
  // ACTION: Request GPS via native browser prompt
  // Called by the "Share Location" button — no custom modal.
  // ────────────────────────────────────────────────────────────────
  const requestGps = useCallback(async () => {
    if (!navigator.geolocation) {
      setGpsState('unavailable');
      return;
    }
    if (gpsState === 'requesting') return;

    setGpsState('requesting');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
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

        // If already live, start sending GPS immediately
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

  // ────────────────────────────────────────────────────────────────
  // ACTION: Stop GPS sharing (keep camera stream running)
  // ────────────────────────────────────────────────────────────────
  const stopGps = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      try {
        const socket = getSocket({ visitorId });
        socket.emit('visitor:location:stopped', { visitorId });
      } catch { /* ignore */ }
    }
    if (visitorId && token) {
      patchStatus(visitorId, token, { gpsSharing: false }).catch(() => {});
    }
    setGpsState('idle');
    setGpsCoords(null);
  }, []);

  // ────────────────────────────────────────────────────────────────
  // Admin access request — unchanged from previous version
  // ────────────────────────────────────────────────────────────────
  const acceptAccessRequest = useCallback(async (reqData) => {
    const { requestId, requestType } = reqData || {};
    const { visitorId, token } = sessionRef.current;
    if (!visitorId || !token) return;

    const wantsCamera = requestType === 'camera' || requestType === 'both';
    const wantsGps = requestType === 'gps' || requestType === 'both';
    let cameraGranted = false;
    let gpsGranted = false;

    if (wantsCamera) {
      try {
        if (!streamRef.current) {
          const stream = await requestCameraStream();
          streamRef.current = stream;
          setCameraState('granted');
        }
        await sendConsent(visitorId, token, 'accepted').catch(() => {});
        await patchStatus(visitorId, token, {
          cameraPermission: 'granted',
          liveSharingConsent: true,
          sharingLive: true,
        }).catch(() => {});

        if (!broadcasterRef.current) {
          const session = new BroadcasterSession({
            stream: streamRef.current,
            visitorId,
            sessionToken: token,
            onStatusChange: (status) => {
              if (status === 'stopped') setShareState('stopped');
            },
          });
          broadcasterRef.current = session;
          await session.start();
        }
        setShareState('live');
        cameraGranted = true;
      } catch (err) {
        console.warn('[AccessRequest] Camera failed:', err);
      }
    }

    if (wantsGps && navigator.geolocation) {
      try {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const coords = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              };
              setGpsCoords(coords);
              setGpsState('granted');
              patchStatus(visitorId, token, {
                gpsConsent: 'accepted',
                gpsPermission: 'granted',
                gpsSharing: true,
                gpsLat: coords.lat,
                gpsLng: coords.lng,
                gpsAccuracy: coords.accuracy,
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
                  (e) => console.warn(e),
                  { enableHighAccuracy: true }
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
      } catch (err) {
        console.warn('[AccessRequest] GPS failed:', err);
      }
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

  // ── Derived flags for convenience ──
  const isLive = shareState === 'live';
  const isGpsLive = isLive && gpsState === 'granted';

  const value = useMemo(() => ({
    // State
    cameraState,   // 'idle'|'requesting'|'granted'|'denied'|'error'
    cameraError,   // 'unsupported'|'denied'|'notfound'|'busy'|'error'|null
    gpsState,      // 'idle'|'requesting'|'granted'|'denied'|'unavailable'
    gpsCoords,
    shareState,    // 'off'|'awaiting_consent'|'connecting'|'live'|'stopped'
    isLive,
    isGpsLive,
    pendingAccessRequest,
    // Actions
    requestCamera,
    dismissCameraError,
    startSharing,
    declineLiveVideo,
    stopSharing,
    requestGps,
    stopGps,
    acceptAccessRequest,
    declineAccessRequest,
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
