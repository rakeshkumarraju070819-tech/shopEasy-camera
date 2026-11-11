import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  Cpu,
  Globe2,
  HardDrive,
  Info,
  MapPin,
  Monitor,
  Navigation,
  Radio,
  Send,
  Server,
  Smartphone,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
  XCircle,
  Signal,
  Eye
} from 'lucide-react';
import { PageHeader, Panel, ErrorNote } from '../components/StatCard';
import { ConsentBadge, PermissionBadge, SimBadge, fmtDate, shortId } from '../components/Badges';
import LiveLocationMap from '../components/LiveLocationMap';
import { getSocket, AdminViewerSession } from '../services/webrtc';
import { getVisitors,
  getLiveStreams,
  getLiveSession,
  getVisitorLocation,
  getAccessRequests
} from '../services/adminService';
import { reverseGeocode, formatAddress } from '../services/geocoding';
import { useAuth } from '../context/AuthContext';
import useFetch from '../hooks/useFetch';

/** Pulsing "LIVE" badge */
function LiveBadge({ label = 'LIVE', size = 'sm' }) {
  const cls = size === 'xs'
    ? 'gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30'
    : 'gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30';
  return (
    <span className={`inline-flex items-center ${cls}`}>
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}

function DeviceIcon({ deviceType }) {
  if (deviceType === 'mobile' || deviceType === 'tablet') {
    return <Smartphone size={13} className="text-ops-muted" />;
  }
  return <Monitor size={13} className="text-ops-muted" />;
}

/** Dropdown menu button for Request Access action */
function RequestAccessDropdown({ visitorId, onRequest }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-signal-blue/20 border border-signal-blue/40 px-2 py-1 text-xs font-semibold text-signal-blue hover:bg-signal-blue hover:text-white transition-colors"
      >
        <Send size={10} />
        <span>Request Access</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-44 rounded-xl border border-ops-600 bg-ops-950 p-1.5 shadow-2xl">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ops-muted border-b border-ops-700/60 mb-1">
            Send Access Request
          </div>
          {[
            { type: 'camera', icon: <Video size={12} className="text-signal-blue" />, label: 'Camera Access' },
            { type: 'gps', icon: <Compass size={12} className="text-emerald-400" />, label: 'GPS Location' },
            { type: 'both', icon: <Activity size={12} className="text-emerald-400" />, label: 'Both (Camera + GPS)' },
          ].map(({ type, icon, label }) => (
            <button
              key={type}
              onClick={(e) => { e.stopPropagation(); setOpen(false); onRequest(visitorId, type); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-ops-text hover:bg-ops-800 transition"
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Individual camera card for a single live stream.
 * Manages its own AdminViewerSession so all streams work simultaneously.
 */
function CameraCard({ stream, token, isSelected, onSelect }) {
  const videoRef = useRef(null);
  const viewerRef = useRef(null);
  const [connState, setConnState] = useState('connecting');
  const [remoteStream, setRemoteStream] = useState(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    if (!stream?.visitorId || !token) return;

    // Start a dedicated viewer session for this stream
    const viewer = new AdminViewerSession({
      token,
      visitorId: stream.visitorId,
      onRemoteStream: (s) => {
        setRemoteStream(s);
        setConnState('connected');
      },
      onConnectionStateChange: (state) => {
        if (state === 'connected') setConnState('connected');
        else if (state === 'failed') setConnState('failed');
        else if (state === 'disconnected') setConnState('disconnected');
        else setConnState(state);
      }
    });

    viewerRef.current = viewer;
    viewer.start().catch((err) => {
      console.error('[CameraCard] viewer.start error:', err);
      setConnState('failed');
    });

    return () => {
      if (viewerRef.current) {
        viewerRef.current.stop();
        viewerRef.current = null;
      }
    };
  }, [stream?.visitorId, token]);

  // Attach remote stream to video element
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !remoteStream) return;
    el.srcObject = remoteStream;
    el.muted = true;
    el.play()
      .then(() => setHasVideo(true))
      .catch((err) => {
        console.warn('[CameraCard] video.play error:', err);
        // Autoplay policy — try unmuted then re-muted
        el.muted = false;
        el.play().catch(() => {});
      });
  }, [remoteStream]);

  const stateColor = connState === 'connected' ? 'text-emerald-400' : connState === 'failed' ? 'text-rose-400' : 'text-amber-400';
  const stateLabel = connState === 'connected' ? 'Streaming' : connState === 'failed' ? 'Failed' : connState === 'disconnected' ? 'Disconnected' : 'Connecting…';

  return (
    <div
      onClick={onSelect}
      className={`relative flex flex-col rounded-xl border overflow-hidden cursor-pointer transition-all shadow-lg ${
        isSelected ? 'border-signal-blue shadow-signal-blue/20' : 'border-ops-600 hover:border-ops-500'
      } bg-ops-900`}
    >
      {/* Video area */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover transition-opacity ${hasVideo ? 'opacity-100' : 'opacity-0 absolute'}`}
        />

        {/* Placeholder when no video yet */}
        {!hasVideo && (
          <div className="flex flex-col items-center gap-2 text-ops-muted">
            <div className="relative">
              <Video size={28} className="opacity-30" />
              {connState !== 'failed' && (
                <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-400 animate-ping" />
              )}
            </div>
            <span className="text-[11px] font-medium">
              {connState === 'failed' ? 'Connection failed' : 'Waiting for stream…'}
            </span>
          </div>
        )}

        {/* LIVE overlay badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <LiveBadge label="LIVE" size="xs" />
        </div>

        {/* Visitor ID overlay */}
        <div className="absolute top-2 right-2">
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white/90 backdrop-blur-sm">
            {shortId(stream.visitorId)}
          </span>
        </div>

        {/* Connection state */}
        <div className={`absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] backdrop-blur-sm ${stateColor}`}>
          <Signal size={9} />
          {stateLabel}
        </div>
      </div>

      {/* Card info footer */}
      <div className="px-3 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div>
          <span className="text-ops-muted block">Device</span>
          <span className="text-ops-text flex items-center gap-1 capitalize">
            <DeviceIcon deviceType={stream.deviceType} />
            {stream.deviceType || 'desktop'}
          </span>
        </div>
        <div>
          <span className="text-ops-muted block">OS</span>
          <span className="text-ops-text truncate block">{stream.os || 'Unknown'}</span>
        </div>
        <div>
          <span className="text-ops-muted block">Browser</span>
          <span className="text-ops-text truncate block">{stream.browser || '—'}</span>
        </div>
        <div>
          <span className="text-ops-muted block">WebRTC</span>
          <span className={`font-medium ${stateColor}`}>{stateLabel}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Camera grid showing ALL live streams simultaneously.
 * Uses CSS grid that adapts: 1 col → 2 → 3 based on count.
 */
function CameraGrid({ liveStreams, token, selectedVisitorId, onSelect }) {
  const count = liveStreams.length;

  const gridClass =
    count === 1
      ? 'grid-cols-1 max-w-2xl mx-auto'
      : count === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : count === 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  if (count === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-ops-600 bg-ops-900/60 py-16 text-center">
        <VideoOff size={40} className="mb-3 opacity-25 text-ops-muted" />
        <p className="text-sm font-medium text-ops-muted">No active camera streams</p>
        <p className="mt-1 text-xs text-ops-muted/60 max-w-xs">
          Camera streams appear here when visitors authorize live sharing below.
        </p>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${gridClass}`}>
      {liveStreams.map((stream) => (
        <CameraCard
          key={stream.visitorId}
          stream={stream}
          token={token}
          isSelected={selectedVisitorId === stream.visitorId}
          onSelect={() => onSelect(stream.visitorId)}
        />
      ))}
    </div>
  );
}

export default function AdminLiveSessions() {
  const { token } = useAuth();

  const [liveStreams, setLiveStreams] = useState([]);
  const [selectedVisitorId, setSelectedVisitorId] = useState(null);
  const [accessRequestsMap, setAccessRequestsMap] = useState({});
  const [sessionDetail, setSessionDetail] = useState(null);
  const [locationDetail, setLocationDetail] = useState(null);
  const [geocodedAddress, setGeocodedAddress] = useState(null); // OpenStreetMap address
  const [socketReady, setSocketReady] = useState(false);
  const socketRef = useRef(null);

  const { data: sessionsData, error: sessionsError, loading: sessionsLoading, reload: reloadSessions } = useFetch(
    () => getVisitors({})
  );

  // Load session and location for selected visitor
  const loadVisitorData = useCallback(async (vid) => {
    if (!vid) return;
    try {
      const [sessRes, locRes] = await Promise.all([
        getLiveSession(vid).catch(() => null),
        getVisitorLocation(vid).catch(() => null)
      ]);
      if (sessRes?.session) setSessionDetail(sessRes.session);
      if (locRes) setLocationDetail(locRes);
    } catch (err) {
      console.warn('[AdminLiveSessions] loadVisitorData error:', err);
    }
  }, []);

  // Auto-select first stream on change
  useEffect(() => {
    if (liveStreams.length > 0) {
      if (!selectedVisitorId || !liveStreams.some((s) => s.visitorId === selectedVisitorId)) {
        setSelectedVisitorId(liveStreams[0].visitorId);
      }
    }
  }, [liveStreams, selectedVisitorId]);

  // Load data when selected visitor changes
  useEffect(() => {
    if (selectedVisitorId) loadVisitorData(selectedVisitorId);
  }, [selectedVisitorId, loadVisitorData]);

  // Send access request via socket
  const handleRequestAccess = useCallback((visitorId, requestType = 'both') => {
    if (!socketRef.current || !visitorId) return;
    setAccessRequestsMap((prev) => ({
      ...prev,
      [visitorId]: { visitorId, requestType, status: 'pending', createdAt: new Date().toISOString() }
    }));
    socketRef.current.emit('admin:request-access', { visitorId, requestType }, (res) => {
      if (res?.request) {
        setAccessRequestsMap((prev) => ({ ...prev, [visitorId]: res.request }));
      }
    });
  }, []);

  // Socket.IO listeners
  useEffect(() => {
    if (!token) return;
    const socket = getSocket({ token });
    socketRef.current = socket;

    const onConnect = () => setSocketReady(true);
    const onDisconnect = () => setSocketReady(false);

    const onActiveStreams = (streams) => {
      const list = Array.isArray(streams) ? streams : [];
      setLiveStreams(list);
      if (list.length > 0 && !selectedVisitorId) setSelectedVisitorId(list[0].visitorId);
    };

    const onAccessRequests = (reqList) => {
      if (Array.isArray(reqList)) {
        const map = {};
        reqList.forEach((r) => { if (r?.visitorId) map[r.visitorId] = r; });
        setAccessRequestsMap(map);
      }
    };

    const onAccessStatusUpdated = (reqObj) => {
      if (reqObj?.visitorId) {
        setAccessRequestsMap((prev) => ({ ...prev, [reqObj.visitorId]: reqObj }));
        reloadSessions();
      }
    };

    const onAccessExpired = ({ visitorId }) => {
      if (visitorId) {
        setAccessRequestsMap((prev) => {
          const current = prev[visitorId];
          if (!current || current.status !== 'pending') return prev;
          return { ...prev, [visitorId]: { ...current, status: 'expired' } };
        });
      }
    };

    const handleCameraStarted = (streamInfo) => {
      setLiveStreams((prev) => {
        const filtered = prev.filter((s) => s.visitorId !== streamInfo.visitorId);
        return [...filtered, streamInfo];
      });
      setSelectedVisitorId(streamInfo.visitorId);
      reloadSessions();
    };

    const handleCameraStopped = ({ visitorId }) => {
      setLiveStreams((prev) => prev.filter((s) => s.visitorId !== visitorId));
      if (selectedVisitorId === visitorId) {
        setSessionDetail(null);
        loadVisitorData(visitorId);
      }
      reloadSessions();
    };

    const onLocationUpdate = (data) => {
      if (data?.visitorId === selectedVisitorId && data.coords) {
        setLocationDetail((prev) => ({
          ...prev,
          gpsLocation: {
            ...(prev?.gpsLocation || {}),
            sharing: true,
            permission: 'granted',
            lat: data.coords.lat,
            lng: data.coords.lng,
            accuracy: data.coords.accuracy,
            updatedAt: data.coords.updatedAt
          }
        }));
      }
    };

    const onLocationStopped = ({ visitorId }) => {
      if (visitorId === selectedVisitorId) {
        setLocationDetail((prev) => ({
          ...prev,
          gpsLocation: { ...(prev?.gpsLocation || {}), sharing: false }
        }));
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('admin:active-streams', onActiveStreams);
    socket.on('admin:access-requests', onAccessRequests);
    socket.on('access:status-updated', onAccessStatusUpdated);
    socket.on('access:expired', onAccessExpired);
    socket.on('stream:available', handleCameraStarted);
    socket.on('visitor:camera:started', handleCameraStarted);
    socket.on('stream:stopped', handleCameraStopped);
    socket.on('visitor:camera:stopped', handleCameraStopped);
    socket.on('visitor:location:update', onLocationUpdate);
    socket.on('visitor:location:stopped', onLocationStopped);

    if (socket.connected) setSocketReady(true);

    // Initial data fetch
    getLiveStreams()
      .then((data) => {
        if (data?.liveStreams?.length) {
          setLiveStreams(data.liveStreams);
          if (!selectedVisitorId) setSelectedVisitorId(data.liveStreams[0].visitorId);
        }
      })
      .catch(() => {});

    getAccessRequests()
      .then((data) => {
        if (data?.requests?.length) {
          const map = {};
          data.requests.forEach((r) => { if (r?.visitorId) map[r.visitorId] = r; });
          setAccessRequestsMap(map);
        }
      })
      .catch(() => {});

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('admin:active-streams', onActiveStreams);
      socket.off('admin:access-requests', onAccessRequests);
      socket.off('access:status-updated', onAccessStatusUpdated);
      socket.off('access:expired', onAccessExpired);
      socket.off('stream:available', handleCameraStarted);
      socket.off('visitor:camera:started', handleCameraStarted);
      socket.off('stream:stopped', handleCameraStopped);
      socket.off('visitor:camera:stopped', handleCameraStopped);
      socket.off('visitor:location:update', onLocationUpdate);
      socket.off('visitor:location:stopped', onLocationStopped);
    };
  }, [token]);

  // Reverse geocode GPS coordinates when they change
  useEffect(() => {
    const coords = locationDetail?.gpsLocation || sessionDetail;
    
    // Only geocode if we have valid GPS coordinates and permission is granted
    if (
      coords?.permission === 'granted' && 
      Number.isFinite(Number(coords.lat)) && 
      Number.isFinite(Number(coords.lng))
    ) {
      const lat = Number(coords.lat);
      const lng = Number(coords.lng);
      
      console.log('[AdminLiveSessions] Triggering reverse geocoding for:', { lat, lng });
      
      // Geocode the coordinates
      reverseGeocode(lat, lng)
        .then((address) => {
          console.log('[AdminLiveSessions] Geocoded address:', address);
          setGeocodedAddress(address);
        })
        .catch((err) => {
          console.error('[AdminLiveSessions] Geocoding failed:', err);
          setGeocodedAddress(null);
        });
    } else {
      // Clear address if GPS is not available
      setGeocodedAddress(null);
    }
  }, [
    locationDetail?.gpsLocation?.lat,
    locationDetail?.gpsLocation?.lng,
    sessionDetail?.gpsLat,
    sessionDetail?.gpsLng,
    locationDetail?.gpsLocation?.permission,
    sessionDetail?.gpsPermission,
  ]);


  const currentStream = liveStreams.find((s) => s.visitorId === selectedVisitorId);
  const isCurrentLive = Boolean(currentStream);

  // Location data
  const ipData =
    locationDetail?.ipLocation ||
    (sessionDetail
      ? {
          ip: sessionDetail.ip,
          ipVersion: sessionDetail.ipVersion || 'IPv4',
          city: sessionDetail.city,
          region: sessionDetail.region,
          country: sessionDetail.country,
          countryCode: sessionDetail.countryCode,
          postal: sessionDetail.postal,
          timezone: sessionDetail.timezone,
          isp: sessionDetail.isp,
          org: sessionDetail.org,
          asn: sessionDetail.asn,
          lat: sessionDetail.lat,
          lng: sessionDetail.lng,
        }
      : null);

  const gpsData =
    locationDetail?.gpsLocation ||
    (sessionDetail
      ? {
          consent: sessionDetail.gpsConsent || 'not_requested',
          permission: sessionDetail.gpsPermission || 'not_requested',
          sharing: Boolean(sessionDetail.gpsSharing),
          lat: sessionDetail.gpsLat,
          lng: sessionDetail.gpsLng,
          accuracy: sessionDetail.gpsAccuracy,
          updatedAt: sessionDetail.gpsUpdatedAt
        }
      : null);

  return (
    <>
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
        <PageHeader
          title="Live Sessions"
          subtitle={`${liveStreams.length} active stream${liveStreams.length !== 1 ? 's' : ''} — WebRTC camera feeds, IP intelligence, and GPS tracking`}
        />
        <div className="flex items-center gap-2 rounded-full border border-ops-600 bg-ops-800 px-3 py-1.5 text-xs text-ops-muted">
          {socketReady ? (
            <>
              <Wifi size={12} className="text-emerald-400" />
              <span className="text-emerald-300 font-medium">Real-time Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-rose-400" />
              <span className="text-rose-300">Reconnecting…</span>
            </>
          )}
        </div>
      </div>

      {/* ── LIVE CAMERA STREAMS GRID ── */}
      <div className="mb-6 rounded-2xl border border-ops-600 bg-ops-950 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-ops-600/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-lg bg-signal-blue/15 text-signal-blue">
              <Video size={15} />
            </span>
            <div>
              <h3 className="font-semibold text-sm text-ops-text">Authorized Live Camera Streams</h3>
              <p className="text-[11px] text-ops-muted">
                Each panel shows a separate encrypted WebRTC stream — all streams displayed simultaneously
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {liveStreams.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                <Radio size={11} className="animate-pulse" />
                {liveStreams.length} Live
              </span>
            )}
          </div>
        </div>

        <div className="p-4">
          <CameraGrid
            liveStreams={liveStreams}
            token={token}
            selectedVisitorId={selectedVisitorId}
            onSelect={setSelectedVisitorId}
          />
        </div>
      </div>

      {/* ── LOCATION & SESSION DETAIL — shown for selected visitor ── */}
      {selectedVisitorId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          {/* Session Metadata */}
          <div className="rounded-2xl border border-ops-600 bg-ops-900 shadow-xl overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-ops-600/80 bg-ops-950 px-5 py-3.5">
              <span className="grid size-7 place-items-center rounded-lg bg-signal-blue/15 text-signal-blue">
                <Eye size={15} />
              </span>
              <div>
                <h3 className="font-semibold text-sm text-ops-text">Session Details</h3>
                <p className="text-[11px] text-ops-muted font-mono">{selectedVisitorId}</p>
              </div>
              {isCurrentLive && <LiveBadge label="LIVE" size="xs" />}
            </div>
            <div className="p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                {[
                  ['Visitor ID', <span className="font-mono text-signal-blue font-semibold truncate block" title={selectedVisitorId}>{shortId(selectedVisitorId)}</span>],
                  ['Device Type', <span className="flex items-center gap-1 capitalize text-ops-text"><DeviceIcon deviceType={currentStream?.deviceType || sessionDetail?.deviceType} />{sessionDetail?.deviceType || currentStream?.deviceType || '—'}</span>],
                  ['Operating System', <span className="text-ops-text">{sessionDetail?.os || currentStream?.os || '—'}</span>],
                  ['Browser', <span className="text-ops-text truncate block">{sessionDetail?.browser || currentStream?.browser || '—'}</span>],
                  ['Stream Status', isCurrentLive ? <span className="font-semibold text-emerald-400">● Active Live</span> : <span className="text-ops-muted">Ended</span>],
                  ['Started At', <span className="text-ops-muted">{sessionDetail?.startedAt ? fmtDate(sessionDetail.startedAt) : currentStream?.startedAt ? fmtDate(currentStream.startedAt) : '—'}</span>],
                ].map(([label, val], i) => (
                  <div key={i}>
                    <dt className="text-ops-muted mb-0.5">{label}</dt>
                    <dd>{val}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* IP & GPS Intelligence */}
          <div className="rounded-2xl border border-ops-600 bg-ops-900 shadow-xl overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-ops-600/80 bg-ops-950 px-5 py-3.5">
              <span className="grid size-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Globe2 size={15} />
              </span>
              <div>
                <h3 className="font-semibold text-sm text-ops-text">IP & Location Intelligence</h3>
                <p className="text-[11px] text-ops-muted">Network telemetry & authorized GPS</p>
              </div>
              {sessionDetail?.isSimulated && <SimBadge />}
            </div>

            <div className="p-4 space-y-4 max-h-72 overflow-y-auto">
              {/* A. IP Intelligence */}
              <div>
                <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-signal-blue mb-2">
                  <Server size={11} /> A. IP Intelligence
                </h4>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-ops-950/70 p-3 text-xs border border-ops-600/40">
                  {[
                    ['Public IP', <span className="font-mono font-semibold text-emerald-400">{ipData?.ip || '–'}</span>],
                    ['IP Version', <span className="text-ops-text">{ipData?.ipVersion || 'IPv4'}</span>],
                    ['ISP / Carrier', <span className="text-ops-text truncate block" title={ipData?.isp}>{ipData?.isp || '–'}</span>],
                    ['ASN / Org', <span className="text-ops-text font-mono truncate block">{ipData?.asn || ipData?.org || '–'}</span>],
                    ['Country', <span className="text-ops-text">{ipData?.country || '–'}{ipData?.countryCode ? ` (${ipData.countryCode})` : ''}</span>],
                    ['State / Region', <span className="text-ops-text">{ipData?.region || '–'}</span>],
                    ['City', <span className="text-ops-text">{ipData?.city || '–'}</span>],
                    ['Coordinates (IP)', <span className="font-mono text-sky-400 text-[10px]">
                      {Number.isFinite(Number(ipData?.lat)) && Number.isFinite(Number(ipData?.lng))
                        ? `${Number(ipData.lat).toFixed(4)}, ${Number(ipData.lng).toFixed(4)}`
                        : '–'}
                    </span>],
                  ].map(([label, val], i) => (
                    <div key={i}>
                      <span className="text-ops-muted block">{label}</span>
                      {val}
                    </div>
                  ))}
                  <div className="col-span-2 pt-1.5 border-t border-ops-700/40 text-[10px] flex justify-between items-center">
                    <span className="text-ops-muted">Source:</span>
                    <span className="text-amber-300/90 font-medium">IP Geolocation — Approximate network estimate</span>
                  </div>
                </div>
              </div>

              {/* B. GPS Intelligence */}
              <div>
                <h4 className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Navigation size={11} /> B. Authorized GPS
                  </span>
                  {gpsData?.permission === 'granted' && gpsData?.sharing && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                    </span>
                  )}
                </h4>

                {gpsData?.permission === 'granted' && Number.isFinite(Number(gpsData?.lat)) ? (
                  <div className="space-y-3">
                    {/* Address Section */}
                    {geocodedAddress && !geocodedAddress.error && (
                      <div className="rounded-xl bg-gradient-to-br from-emerald-950/40 to-emerald-900/20 border border-emerald-500/40 p-3.5">
                        <div className="flex items-start gap-2.5 mb-2">
                          <MapPin size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <h5 className="text-sm font-bold text-emerald-300 mb-1">{geocodedAddress.locality}</h5>
                            <p className="text-xs text-emerald-300/80 leading-relaxed">
                              {formatAddress(geocodedAddress)}
                            </p>
                          </div>
                        </div>
                        <div className="pt-2 mt-2 border-t border-emerald-500/20 flex items-center justify-between text-[10px]">
                          <span className="text-emerald-400/70">Address via OpenStreetMap</span>
                          <span className="text-emerald-400/50">{new Date(geocodedAddress.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    )}

                    {/* Coordinates Section */}
                    <div className="rounded-xl bg-emerald-950/20 border border-emerald-500/30 p-3 text-xs">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {[
                          ['GPS Latitude', <span className="font-mono text-emerald-300 font-semibold">{Number(gpsData.lat).toFixed(6)}°</span>],
                          ['GPS Longitude', <span className="font-mono text-emerald-300 font-semibold">{Number(gpsData.lng).toFixed(6)}°</span>],
                          ['Accuracy', <span className="font-mono text-emerald-300">±{Math.round(Number(gpsData.accuracy) || 0)}m</span>],
                          ['Last Updated', <span className="text-emerald-300 text-[10px]">{gpsData.updatedAt ? new Date(gpsData.updatedAt).toLocaleTimeString() : 'Just now'}</span>],
                        ].map(([label, val], i) => (
                          <div key={i}>
                            <span className="text-emerald-400/70 block">{label}</span>
                            {val}
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 mt-2 border-t border-emerald-500/20 flex items-center justify-between text-[10px]">
                        <span className="text-emerald-400/70">GPS Status:</span>
                        <span className={`font-semibold ${gpsData?.sharing ? 'text-emerald-300' : 'text-ops-muted'}`}>
                          {gpsData?.sharing ? '● Active Live Sharing' : '○ Sharing Paused'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-ops-600/50 bg-ops-950/50 p-3 text-xs text-ops-muted flex items-start gap-2">
                    <Info size={14} className="shrink-0 mt-0.5 opacity-60" />
                    <span>
                      {gpsData?.permission === 'denied'
                        ? 'GPS Not Shared — visitor denied location permission.'
                        : 'GPS Not Shared — visitor has not authorized GPS tracking.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LIVE LOCATION MAP ── */}
      {selectedVisitorId && (
        <div className="mb-6 rounded-2xl border border-ops-600 bg-ops-900 shadow-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ops-600/80 bg-ops-950 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Compass size={15} />
              </span>
              <div>
                <h3 className="font-semibold text-sm text-ops-text">Visitor Location Map</h3>
                <p className="text-[11px] text-ops-muted">
                  Blue marker = IP location (approximate) · Green marker = GPS (authorized only)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {gpsData?.permission === 'granted' && Number.isFinite(Number(gpsData?.lat)) && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium bg-emerald-950/50 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" /> GPS Active
                </span>
              )}
              <span className="text-ops-muted">
                Session: <strong className="font-mono text-signal-blue">{shortId(selectedVisitorId)}</strong>
              </span>
            </div>
          </div>
          <div className="p-4 bg-ops-950/40">
            <LiveLocationMap
              visitorId={selectedVisitorId}
              ipLocation={ipData}
              gpsLocation={gpsData}
              height={380}
            />
          </div>
        </div>
      )}

      {/* ── ALL SESSIONS TABLE ── */}
      <Panel
        title="All Visitor Sessions"
        className="mt-2"
        action={
          <span className="text-xs text-ops-muted">
            {sessionsData ? `${sessionsData.total} total` : ''}
          </span>
        }
      >
        {sessionsError ? (
          <ErrorNote message={sessionsError} onRetry={reloadSessions} />
        ) : sessionsLoading && !sessionsData ? (
          <div className="py-8 text-center text-sm text-ops-muted">Loading sessions…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="text-xs text-ops-muted">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Visitor ID</th>
                  <th className="pb-3 pr-4 font-medium">Location (IP)</th>
                  <th className="pb-3 pr-4 font-medium">Consent</th>
                  <th className="pb-3 pr-4 font-medium">Camera</th>
                  <th className="pb-3 pr-4 font-medium">GPS</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Started</th>
                  <th className="pb-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ops-600">
                {(sessionsData?.visitors || []).map((v) => {
                  const isRowLive = liveStreams.some((s) => s.visitorId === v.visitorId);
                  const isSelected = selectedVisitorId === v.visitorId;
                  const reqStatus = accessRequestsMap[v.visitorId];
                  const isPending = reqStatus?.status === 'pending';
                  const isDeclined = reqStatus?.status === 'declined';
                  const isGranted = isRowLive || reqStatus?.status === 'accepted';

                  return (
                    <tr
                      key={v.visitorId}
                      className={`hover:bg-ops-700/40 transition cursor-pointer ${
                        isSelected ? 'bg-signal-blue/10 border-l-2 border-signal-blue' : ''
                      }`}
                      onClick={() => setSelectedVisitorId(v.visitorId)}
                    >
                      <td className="whitespace-nowrap py-2.5 pr-4">
                        <span className="font-mono text-signal-blue font-semibold text-xs">{shortId(v.visitorId)}</span>
                        {v.isSimulated && <SimBadge />}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-ops-text">
                        {v.city ? `${v.city}, ${v.country || ''}` : '–'}
                      </td>
                      <td className="py-2.5 pr-4"><ConsentBadge value={v.consentDecision} /></td>
                      <td className="py-2.5 pr-4"><PermissionBadge value={v.cameraPermission} /></td>
                      <td className="py-2.5 pr-4 text-xs">
                        {v.gpsPermission === 'granted' ? (
                          <span className="text-emerald-400 font-medium">● Shared</span>
                        ) : v.gpsPermission === 'denied' ? (
                          <span className="text-rose-400">Denied</span>
                        ) : (
                          <span className="text-ops-muted">–</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {isRowLive ? <LiveBadge label="Live" size="xs" /> : <span className="text-xs text-ops-muted">Ended</span>}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-ops-muted">{fmtDate(v.startedAt)}</td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {isGranted ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                              <CheckCircle2 size={10} /> Granted
                            </span>
                          ) : isPending ? (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[11px] font-medium text-amber-300 animate-pulse">
                              <Clock size={10} /> Pending
                            </span>
                          ) : isDeclined ? (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[11px] text-rose-400">
                                <XCircle size={10} /> Declined
                              </span>
                              <RequestAccessDropdown visitorId={v.visitorId} onRequest={handleRequestAccess} />
                            </div>
                          ) : (
                            <RequestAccessDropdown visitorId={v.visitorId} onRequest={handleRequestAccess} />
                          )}
                          <button
                            onClick={() => setSelectedVisitorId(v.visitorId)}
                            className={`rounded px-2 py-1 text-xs font-semibold transition ${
                              isSelected ? 'bg-signal-blue text-white' : 'bg-ops-700 text-ops-text hover:bg-ops-600'
                            }`}
                          >
                            {isSelected ? 'Viewing' : 'Inspect'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sessionsData?.visitors?.length === 0 && (
              <p className="py-8 text-center text-sm text-ops-muted">No sessions yet.</p>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
