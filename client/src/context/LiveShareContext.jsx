import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { requestCameraStream, stopStream, classifyCameraError, cameraSupported } from '../services/camera';
import { BroadcasterSession, disconnectSocket, getSocket } from '../services/webrtc';
import { createSession, sendConsent, patchStatus } from '../services/visitorService';

/**
 * LiveShareContext — customer-side live-sharing state machine.
 */
const LiveShareContext = createContext(null);
const LS_KEY = 'cs.liveshare';

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function writeLocal(d) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

export function LiveShareProvider({ children }) {
  const saved = readLocal();

  const initialPhase = ['declined', 'stopped'].includes(saved.phase) ? saved.phase : 'idle';
  const [phase, setPhase] = useState(initialPhase);
  const [cameraError, setCameraError] = useState(null);

  // GPS state
  const [gpsConsent, setGpsConsent] = useState(saved.gpsConsent || 'not_requested');
  const [gpsPermission, setGpsPermission] = useState(saved.gpsPermission || 'not_requested');
  const [gpsCoords, setGpsCoords] = useState(null);

  // Admin access request state
  const [pendingAccessRequest, setPendingAccessRequest] = useState(null);

  // Backend session credentials
  const sessionRef = useRef({ visitorId: saved.visitorId || null, token: saved.token || null });

  const streamRef = useRef(null);
  const broadcasterRef = useRef(null);
  const watchIdRef = useRef(null);

  const persist = (updates) => {
    const next = { ...readLocal(), ...updates };
    writeLocal(next);
  };

  /* ─── Ensure session exists on backend ─── */
  const ensureSession = useCallback(async () => {
    if (sessionRef.current.visitorId && sessionRef.current.token) {
      return sessionRef.current;
    }
    const { visitorId, sessionToken } = await createSession();
    sessionRef.current = { visitorId, token: sessionToken };
    persist({ visitorId, token: sessionToken });
    return sessionRef.current;
  }, []);

  // Connect socket and listen for incoming admin requests
  useEffect(() => {
    let active = true;

    ensureSession().then(({ visitorId, token }) => {
      if (!active || !visitorId) return;

      const socket = getSocket({ visitorId, sessionToken: token });

      const onAccessRequest = (data) => {
        if (data && data.requestId) {
          setPendingAccessRequest(data);
        }
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

    return () => {
      active = false;
    };
  }, [ensureSession]);

  /* ─── customer clicked "No, Continue Shopping" on initial modal ─── */
  const decline = useCallback(async () => {
    setPhase('declined');
    persist({ phase: 'declined' });
    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) {
      sendConsent(visitorId, token, 'declined').catch(() => {});
    }
  }, []);

  /* ─── customer clicked "Yes, Participate" on initial modal ─── */
  const requestPermission = useCallback(async () => {
    if (!cameraSupported()) {
      setCameraError('unsupported');
      setPhase('permError');
      return;
    }

    setPhase('requesting');

    try {
      const { visitorId, token } = await ensureSession();
      await sendConsent(visitorId, token, 'accepted');

      const stream = await requestCameraStream();
      streamRef.current = stream;

      await patchStatus(visitorId, token, { cameraPermission: 'granted' });
      setPhase('gps_prompt');
    } catch (err) {
      const kind = classifyCameraError(err);
      setCameraError(kind);
      setPhase(kind === 'denied' ? 'permDenied' : 'permError');

      const { visitorId, token } = sessionRef.current;
      if (visitorId && token) {
        const permResult = kind === 'denied' ? 'denied' : 'error';
        patchStatus(visitorId, token, { cameraPermission: permResult }).catch(() => {});
      }
    }
  }, [ensureSession]);

  /* ─── customer accepts GPS location demonstration ─── */
  const acceptGps = useCallback(async () => {
    if (!navigator.geolocation) {
      setGpsConsent('accepted');
      setGpsPermission('unsupported');
      const { visitorId, token } = sessionRef.current;
      if (visitorId && token) {
        patchStatus(visitorId, token, { gpsConsent: 'accepted', gpsPermission: 'unsupported' }).catch(() => {});
      }
      setPhase('confirming');
      return;
    }

    setPhase('requesting_gps');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        setGpsCoords(coords);
        setGpsConsent('accepted');
        setGpsPermission('granted');
        persist({ gpsConsent: 'accepted', gpsPermission: 'granted' });

        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, {
            gpsConsent: 'accepted',
            gpsPermission: 'granted',
            gpsLat: coords.lat,
            gpsLng: coords.lng,
            gpsAccuracy: coords.accuracy
          }).catch(() => {});
        }
        setPhase('confirming');
      },
      (err) => {
        console.warn('[GPS prompt denied or failed]', err.message);
        setGpsConsent('accepted');
        setGpsPermission('denied');
        persist({ gpsConsent: 'accepted', gpsPermission: 'denied' });

        const { visitorId, token } = sessionRef.current;
        if (visitorId && token) {
          patchStatus(visitorId, token, { gpsConsent: 'accepted', gpsPermission: 'denied' }).catch(() => {});
        }
        setPhase('confirming');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  /* ─── customer skips/declines GPS ─── */
  const skipGps = useCallback(() => {
    setGpsConsent('declined');
    setGpsPermission('not_requested');
    persist({ gpsConsent: 'declined', gpsPermission: 'not_requested' });

    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) {
      patchStatus(visitorId, token, { gpsConsent: 'declined', gpsPermission: 'not_requested' }).catch(() => {});
    }
    setPhase('confirming');
  }, []);

  /* ─── customer confirmed "Start Live Sharing" ─── */
  const startSharing = useCallback(async () => {
    if (!streamRef.current) return;
    const { visitorId, token } = sessionRef.current;
    if (!visitorId || !token) return;

    setPhase('starting');

    try {
      await patchStatus(visitorId, token, { liveSharingConsent: true });

      const session = new BroadcasterSession({
        stream: streamRef.current,
        visitorId,
        sessionToken: token,
        onStatusChange: (status) => {
          if (status === 'stopped') setPhase('stopped');
        }
      });

      broadcasterRef.current = session;
      await session.start();

      if (gpsPermission === 'granted' && navigator.geolocation) {
        const socket = getSocket({ visitorId, sessionToken: token });

        if (gpsCoords) {
          socket.emit('visitor:location:update', { visitorId, coords: gpsCoords });
        }

        try {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              const updated = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
              };
              setGpsCoords(updated);
              socket.emit('visitor:location:update', { visitorId, coords: updated });
            },
            (err) => console.warn('[GPS watchPosition]', err.message),
            { enableHighAccuracy: true }
          );
        } catch (err) {
          console.warn('[GPS watchPosition error]', err);
        }
      }

      setPhase('live');
    } catch (err) {
      console.error('[LiveShare] startSharing error:', err);
      setPhase('permError');
      setCameraError('error');
    }
  }, [gpsPermission, gpsCoords]);

  /* ─── Customer accepts Admin Access Request ─── */
  const acceptAccessRequest = useCallback(
    async (reqData) => {
      const { requestId, requestType } = reqData || {};
      const { visitorId, token } = sessionRef.current;
      if (!visitorId || !token) return;

      const wantsCamera = requestType === 'camera' || requestType === 'both';
      const wantsGps = requestType === 'gps' || requestType === 'both';

      let cameraGranted = false;
      let gpsGranted = false;

      // 1. Camera setup if requested
      if (wantsCamera) {
        try {
          if (!streamRef.current) {
            const stream = await requestCameraStream();
            streamRef.current = stream;
          }
          await sendConsent(visitorId, token, 'accepted');
          await patchStatus(visitorId, token, {
            cameraPermission: 'granted',
            liveSharingConsent: true,
            sharingLive: true
          });

          if (!broadcasterRef.current) {
            const session = new BroadcasterSession({
              stream: streamRef.current,
              visitorId,
              sessionToken: token,
              onStatusChange: (status) => {
                if (status === 'stopped') setPhase('stopped');
              }
            });
            broadcasterRef.current = session;
            await session.start();
          }

          cameraGranted = true;
        } catch (err) {
          console.warn('[AccessRequest] Camera permission failed:', err);
        }
      }

      // 2. GPS setup if requested
      if (wantsGps && navigator.geolocation) {
        try {
          await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const coords = {
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  accuracy: pos.coords.accuracy
                };
                setGpsCoords(coords);
                setGpsConsent('accepted');
                setGpsPermission('granted');

                patchStatus(visitorId, token, {
                  gpsConsent: 'accepted',
                  gpsPermission: 'granted',
                  gpsSharing: true,
                  gpsLat: coords.lat,
                  gpsLng: coords.lng,
                  gpsAccuracy: coords.accuracy
                }).catch(() => {});

                const socket = getSocket({ visitorId, sessionToken: token });
                socket.emit('visitor:location:update', { visitorId, coords });

                if (!watchIdRef.current) {
                  watchIdRef.current = navigator.geolocation.watchPosition(
                    (p) => {
                      const updated = {
                        lat: p.coords.latitude,
                        lng: p.coords.longitude,
                        accuracy: p.coords.accuracy
                      };
                      setGpsCoords(updated);
                      socket.emit('visitor:location:update', { visitorId, coords: updated });
                    },
                    (e) => console.warn(e),
                    { enableHighAccuracy: true }
                  );
                }

                gpsGranted = true;
                resolve();
              },
              () => {
                setGpsConsent('accepted');
                setGpsPermission('denied');
                patchStatus(visitorId, token, { gpsConsent: 'accepted', gpsPermission: 'denied' }).catch(() => {});
                resolve();
              },
              { enableHighAccuracy: true, timeout: 8000 }
            );
          });
        } catch (err) {
          console.warn('[AccessRequest] GPS permission failed:', err);
        }
      }

      // 3. Notify server via socket
      const socket = getSocket({ visitorId, sessionToken: token });
      socket.emit('access:accepted', {
        requestId,
        visitorId,
        cameraApproved: cameraGranted,
        gpsApproved: gpsGranted
      });

      setPendingAccessRequest(null);
      if (cameraGranted || gpsGranted) {
        setPhase('live');
      }
    },
    []
  );

  /* ─── Customer declines Admin Access Request ─── */
  const declineAccessRequest = useCallback((reqData) => {
    const { requestId } = reqData || {};
    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      const socket = getSocket({ visitorId, sessionToken: token });
      socket.emit('access:declined', {
        requestId,
        visitorId
      });
    }
    setPendingAccessRequest(null);
  }, []);

  /* ─── customer clicked "Stop Sharing" ─── */
  const stopSharing = useCallback(async () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
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
    persist({ phase: 'stopped' });
    setPhase('stopped');
  }, []);

  /* ─── cleanup when tab closes ─── */
  useEffect(() => {
    const onHide = () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (broadcasterRef.current) broadcasterRef.current.stop();
      if (streamRef.current) stopStream(streamRef.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, []);

  const value = useMemo(() => ({
    phase,
    cameraError,
    isLive: phase === 'live',
    gpsConsent,
    gpsPermission,
    gpsCoords,
    pendingAccessRequest,
    decline,
    requestPermission,
    acceptGps,
    skipGps,
    startSharing,
    stopSharing,
    acceptAccessRequest,
    declineAccessRequest
  }), [
    phase,
    cameraError,
    gpsConsent,
    gpsPermission,
    gpsCoords,
    pendingAccessRequest,
    decline,
    requestPermission,
    acceptGps,
    skipGps,
    startSharing,
    stopSharing,
    acceptAccessRequest,
    declineAccessRequest
  ]);

  return (
    <LiveShareContext.Provider value={value}>
      {children}
    </LiveShareContext.Provider>
  );
}

export const useLiveShare = () => useContext(LiveShareContext);
