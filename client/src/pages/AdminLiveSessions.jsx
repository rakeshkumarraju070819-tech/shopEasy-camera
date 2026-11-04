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
  Radio,
  Send,
  Server,
  Smartphone,
  Video,
  VideoOff,
  Wifi,
  WifiOff,
  XCircle
} from 'lucide-react';
import { PageHeader, Panel, ErrorNote } from '../components/StatCard';
import { ConsentBadge, PermissionBadge, SimBadge, fmtDate, shortId } from '../components/Badges';
import LiveLocationMap from '../components/LiveLocationMap';
import { getSocket, AdminViewerSession } from '../services/webrtc';
import {
  getVisitors,
  getLiveStreams,
  getLiveSession,
  getVisitorLocation,
  getAccessRequests
} from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import useFetch from '../hooks/useFetch';

/** Pulsing "LIVE" badge */
function LiveBadge({ label = 'LIVE' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}

function DeviceIcon({ deviceType }) {
  if (deviceType === 'mobile' || deviceType === 'tablet') {
    return <Smartphone size={14} className="text-ops-muted" />;
  }
  return <Monitor size={14} className="text-ops-muted" />;
}

/** Dropdown menu button for Request Access action */
function RequestAccessDropdown({ visitorId, onRequest, isEligible = true }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!isEligible) return null;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-signal-blue/20 border border-signal-blue/40 px-2.5 py-1 text-xs font-semibold text-signal-blue hover:bg-signal-blue hover:text-white transition-colors"
      >
        <Send size={11} />
        <span>Request Access</span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-48 rounded-xl border border-ops-600 bg-ops-950 p-1.5 shadow-2xl backdrop-blur-md">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ops-muted border-b border-ops-700/60 mb-1">
            Send Access Request
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRequest(visitorId, 'camera');
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-ops-text hover:bg-ops-800 transition"
          >
            <Video size={13} className="text-signal-blue" />
            <span>Camera Access</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRequest(visitorId, 'gps');
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-ops-text hover:bg-ops-800 transition"
          >
            <Compass size={13} className="text-emerald-400" />
            <span>GPS Location</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRequest(visitorId, 'both');
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-950/40 border-t border-ops-700/60 mt-1 transition"
          >
            <Activity size={13} className="text-emerald-400" />
            <span>Both (Camera + GPS)</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminLiveSessions() {
  const { token } = useAuth();

  // Active WebRTC streams reported by Socket.IO
  const [liveStreams, setLiveStreams] = useState([]);
  const [selectedVisitorId, setSelectedVisitorId] = useState(null);

  // Access requests map: visitorId -> AccessRequest object
  const [accessRequestsMap, setAccessRequestsMap] = useState({});

  // Full session details for currently selected visitor
  const [sessionDetail, setSessionDetail] = useState(null);
  const [locationDetail, setLocationDetail] = useState(null);

  // WebRTC viewer state
  const videoRef = useRef(null);
  const viewerRef = useRef(null);
  const watchedVidRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connState, setConnState] = useState('idle');
  const [watching, setWatching] = useState(false);

  // Socket connection status
  const [socketReady, setSocketReady] = useState(false);
  const socketRef = useRef(null);

  // Sessions list for bottom table
  const { data: sessionsData, error: sessionsError, loading: sessionsLoading, reload: reloadSessions } = useFetch(
    () => getVisitors({})
  );

  // Load detailed session and location data for selected visitor
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

  // WebRTC watching management
  const startWatching = useCallback(
    async (vid) => {
      if (!vid || !token) return;
      if (watchedVidRef.current === vid && viewerRef.current) return;

      if (viewerRef.current) {
        viewerRef.current.stop();
        viewerRef.current = null;
      }

      watchedVidRef.current = vid;
      setConnState('connecting');
      setWatching(true);

      const viewer = new AdminViewerSession({
        token,
        visitorId: vid,
        onRemoteStream: (stream) => {
          setRemoteStream(stream);
          setConnState('connected');
        },
        onConnectionStateChange: (state) => {
          setConnState(state === 'connected' ? 'connected' : state === 'failed' ? 'failed' : state);
        }
      });

      viewerRef.current = viewer;
      await viewer.start();
    },
    [token]
  );

  const stopWatching = useCallback(() => {
    watchedVidRef.current = null;
    if (viewerRef.current) {
      viewerRef.current.stop();
      viewerRef.current = null;
    }
    setRemoteStream(null);
    setWatching(false);
    setConnState('idle');
  }, []);

  // Attach stream to <video> element reliably
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
      videoRef.current.muted = true;
      videoRef.current.play().catch((err) => {
        console.warn('[video play error]', err);
      });
    }
  }, [remoteStream, watching]);

  // Initial selection
  useEffect(() => {
    if (liveStreams.length > 0) {
      const firstActive = liveStreams[0].visitorId;
      if (!selectedVisitorId || !liveStreams.some((s) => s.visitorId === selectedVisitorId)) {
        setSelectedVisitorId(firstActive);
      }
    } else if (!selectedVisitorId && sessionsData?.visitors?.length) {
      setSelectedVisitorId(sessionsData.visitors[0].visitorId);
    }
  }, [liveStreams, selectedVisitorId, sessionsData]);

  // When selected visitor changes
  useEffect(() => {
    if (!selectedVisitorId) return;

    loadVisitorData(selectedVisitorId);

    const isLive = liveStreams.some((s) => s.visitorId === selectedVisitorId);
    if (isLive) {
      startWatching(selectedVisitorId);
    } else {
      stopWatching();
    }
  }, [selectedVisitorId, liveStreams.length]);

  // Clean up WebRTC on unmount
  useEffect(() => {
    return () => {
      watchedVidRef.current = null;
      if (viewerRef.current) viewerRef.current.stop();
    };
  }, []);

  // Send an access request via Socket.IO
  const handleRequestAccess = useCallback((visitorId, requestType = 'both') => {
    if (!socketRef.current || !visitorId) return;

    // Optimistic update
    setAccessRequestsMap((prev) => ({
      ...prev,
      [visitorId]: {
        visitorId,
        requestType,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    }));

    socketRef.current.emit('admin:request-access', { visitorId, requestType }, (res) => {
      if (res?.error) {
        console.warn('[RequestAccess error]', res.error);
      } else if (res?.request) {
        setAccessRequestsMap((prev) => ({
          ...prev,
          [visitorId]: res.request
        }));
      }
    });
  }, []);

  // Socket.IO event listeners
  useEffect(() => {
    if (!token) return;

    const socket = getSocket({ token });
    socketRef.current = socket;

    const onConnect = () => setSocketReady(true);
    const onDisconnect = () => setSocketReady(false);

    const onActiveStreams = (streams) => {
      const list = Array.isArray(streams) ? streams : [];
      setLiveStreams(list);
      if (list.length > 0 && !selectedVisitorId) {
        setSelectedVisitorId(list[0].visitorId);
      }
    };

    const onAccessRequests = (reqList) => {
      if (Array.isArray(reqList)) {
        const map = {};
        reqList.forEach((r) => {
          if (r?.visitorId) map[r.visitorId] = r;
        });
        setAccessRequestsMap(map);
      }
    };

    const onAccessStatusUpdated = (reqObj) => {
      if (reqObj?.visitorId) {
        setAccessRequestsMap((prev) => ({
          ...prev,
          [reqObj.visitorId]: reqObj
        }));
        reloadSessions();
      }
    };

    const onAccessExpired = ({ visitorId }) => {
      if (visitorId) {
        setAccessRequestsMap((prev) => {
          const current = prev[visitorId];
          if (!current || current.status !== 'pending') return prev;
          return {
            ...prev,
            [visitorId]: { ...current, status: 'expired' }
          };
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
      if (watchedVidRef.current === visitorId) {
        stopWatching();
        loadVisitorData(visitorId);
      }
      reloadSessions();
    };

    const onLocationUpdate = (data) => {
      if (data?.visitorId && data.coords) {
        setLocationDetail((prev) => {
          if (!prev || prev.visitorId !== data.visitorId) return prev;
          return {
            ...prev,
            gpsLocation: {
              ...prev.gpsLocation,
              sharing: true,
              permission: 'granted',
              lat: data.coords.lat,
              lng: data.coords.lng,
              accuracy: data.coords.accuracy,
              updatedAt: data.coords.updatedAt
            }
          };
        });
      }
    };

    const onLocationStopped = ({ visitorId }) => {
      setLocationDetail((prev) => {
        if (!prev || prev.visitorId !== visitorId) return prev;
        return {
          ...prev,
          gpsLocation: {
            ...prev.gpsLocation,
            sharing: false
          }
        };
      });
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
          data.requests.forEach((r) => {
            if (r?.visitorId) map[r.visitorId] = r;
          });
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

  const isCurrentLive = liveStreams.some((s) => s.visitorId === selectedVisitorId);
  const currentStream = liveStreams.find((s) => s.visitorId === selectedVisitorId);

  // IP and GPS location data
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
          ipSource: sessionDetail.ipSource
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
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
        <PageHeader
          title="Live Sessions"
          subtitle="Real-time WebRTC camera feed, genuine IP network intelligence, and GPS location tracking."
        />

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-ops-600 bg-ops-800 px-3 py-1.5 text-xs text-ops-muted">
            {socketReady ? (
              <>
                <Wifi size={13} className="text-emerald-400" />
                <span className="text-emerald-300 font-medium">Real-time Connected</span>
              </>
            ) : (
              <>
                <WifiOff size={13} className="text-rose-400" />
                <span className="text-rose-300">Reconnecting Socket…</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Active Broadcasts Selector Bar */}
      {liveStreams.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Radio size={14} className="animate-pulse" /> Active Broadcasts:
          </span>
          {liveStreams.map((s) => (
            <button
              key={s.visitorId}
              onClick={() => setSelectedVisitorId(s.visitorId)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                selectedVisitorId === s.visitorId
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'bg-ops-800 text-ops-muted hover:bg-ops-700 hover:text-white'
              }`}
            >
              <span className="size-2 rounded-full bg-emerald-300 animate-ping" />
              <span className="font-opsmono">{shortId(s.visitorId)}</span>
              <span className="text-[10px] opacity-75 capitalize">({s.deviceType || 'device'})</span>
            </button>
          ))}
        </div>
      )}

      {/* ── TOP SECTION: TWO COLUMNS (Matching Heights) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* ── LEFT CARD: LIVE CAMERA ── */}
        <div className="flex flex-col rounded-2xl border border-ops-600 bg-ops-900 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-ops-600/80 bg-ops-950 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-signal-blue/15 text-signal-blue">
                <Video size={18} />
              </span>
              <div>
                <h3 className="font-semibold text-sm text-ops-text">Authorized Live Camera</h3>
                <p className="text-[11px] text-ops-muted">Direct WebRTC one-to-one encrypted stream</p>
              </div>
            </div>

            {isCurrentLive ? (
              <LiveBadge label="LIVE" />
            ) : (
              <span className="rounded-full bg-ops-700 px-2.5 py-0.5 text-xs text-ops-muted font-medium">
                Ended
              </span>
            )}
          </div>

          {/* Video Player Display */}
          <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
            {isCurrentLive && watching ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="p-8 text-center text-ops-muted">
                <VideoOff size={44} className="mx-auto mb-3 opacity-30 text-ops-muted" />
                <p className="text-sm font-medium">
                  {isCurrentLive ? 'Click Watch Live to display incoming stream' : 'No camera currently broadcasting'}
                </p>
                <p className="mt-1 text-xs text-ops-muted/70 max-w-xs mx-auto">
                  Live video is visible only when the visitor explicitly grants consent and browser camera permission.
                </p>
              </div>
            )}

            {isCurrentLive && (
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <LiveBadge label="LIVE" />
                <span className="rounded bg-black/60 px-2 py-0.5 text-[11px] font-mono text-white/90 backdrop-blur-sm">
                  {shortId(selectedVisitorId)}
                </span>
              </div>
            )}

            {watching && isCurrentLive && (
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1 text-xs text-emerald-300 backdrop-blur-sm">
                <span className="size-2 rounded-full bg-emerald-400" />
                <span>WebRTC {connState === 'connected' ? 'Connected' : 'Connecting…'}</span>
              </div>
            )}
          </div>

          {/* Card Body & Session Metadata */}
          <div className="flex-1 p-5 flex flex-col justify-between space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              <div>
                <dt className="text-ops-muted">Visitor ID</dt>
                <dd className="font-opsmono font-semibold text-signal-blue truncate" title={selectedVisitorId}>
                  {selectedVisitorId || 'None'}
                </dd>
              </div>
              <div>
                <dt className="text-ops-muted">Device & Platform</dt>
                <dd className="flex items-center gap-1.5 capitalize text-ops-text">
                  <DeviceIcon deviceType={currentStream?.deviceType || sessionDetail?.deviceType} />
                  <span>{sessionDetail?.deviceType || currentStream?.deviceType || 'Desktop'}</span>
                  <span className="text-ops-muted">({sessionDetail?.os || currentStream?.os || 'Windows'})</span>
                </dd>
              </div>
              <div>
                <dt className="text-ops-muted">Browser</dt>
                <dd className="text-ops-text truncate" title={sessionDetail?.browser || currentStream?.browser}>
                  {sessionDetail?.browser || currentStream?.browser || 'Chrome'}
                </dd>
              </div>
              <div>
                <dt className="text-ops-muted">WebRTC State</dt>
                <dd className="capitalize font-medium">
                  {connState === 'connected' ? (
                    <span className="text-emerald-400">● Streaming Video</span>
                  ) : connState === 'connecting' ? (
                    <span className="text-amber-400">○ Connecting…</span>
                  ) : (
                    <span className="text-ops-muted">{isCurrentLive ? 'Ready' : 'Closed'}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-ops-muted">Session Started</dt>
                <dd className="text-ops-muted">
                  {sessionDetail?.startedAt ? fmtDate(sessionDetail.startedAt) : currentStream?.startedAt ? fmtDate(currentStream.startedAt) : '–'}
                </dd>
              </div>
              <div>
                <dt className="text-ops-muted">Stream Status</dt>
                <dd>
                  {isCurrentLive ? (
                    <span className="font-semibold text-emerald-400">Active Live</span>
                  ) : (
                    <span className="text-ops-muted">Ended</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="pt-2 border-t border-ops-600/60 flex items-center gap-3">
              {isCurrentLive ? (
                !watching ? (
                  <button
                    onClick={() => startWatching(selectedVisitorId)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-signal-blue px-4 py-2.5 text-xs font-semibold text-white shadow hover:brightness-110 transition"
                  >
                    <Video size={14} /> Watch Live Stream
                  </button>
                ) : (
                  <button
                    onClick={stopWatching}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-ops-600 bg-ops-800 px-4 py-2.5 text-xs font-semibold text-ops-text hover:bg-ops-700 transition"
                  >
                    <VideoOff size={14} /> Stop Watching
                  </button>
                )
              ) : (
                <div className="w-full text-center py-1 text-xs text-ops-muted">
                  Stream closed. Visitor session record preserved below.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT CARD: COMPLETE IP INTELLIGENCE & LOCATION DETAILS ── */}
        <div className="flex flex-col rounded-2xl border border-ops-600 bg-ops-900 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-ops-600/80 bg-ops-950 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Globe2 size={18} />
              </span>
              <div>
                <h3 className="font-semibold text-sm text-ops-text">Visitor IP & Location Intelligence</h3>
                <p className="text-[11px] text-ops-muted">Real-world network telemetry & authorized GPS coordinates</p>
              </div>
            </div>

            {sessionDetail?.isSimulated && <SimBadge />}
          </div>

          <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[500px]">
            {/* Section 1: Public IP Information */}
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-signal-blue mb-2.5">
                <Server size={13} /> Public IP Information
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-ops-950/70 p-3 text-xs border border-ops-600/40">
                <div>
                  <span className="text-ops-muted block">Public IP Address</span>
                  <span className="font-opsmono font-semibold text-emerald-400">{ipData?.ip || '–'}</span>
                </div>
                <div>
                  <span className="text-ops-muted block">IP Version</span>
                  <span className="text-ops-text font-medium">{ipData?.ipVersion || 'IPv4'}</span>
                </div>
                <div>
                  <span className="text-ops-muted block">ISP / Carrier</span>
                  <span className="text-ops-text truncate block" title={ipData?.isp}>{ipData?.isp || '–'}</span>
                </div>
                <div>
                  <span className="text-ops-muted block">Organization & ASN</span>
                  <span className="text-ops-text font-opsmono truncate block" title={ipData?.org || ipData?.asn}>
                    {ipData?.asn ? `${ipData.asn}` : ipData?.org || '–'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Approximate IP Location */}
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-signal-blue mb-2.5">
                <MapPin size={13} /> Approximate IP Location
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 rounded-xl bg-ops-950/70 p-3 text-xs border border-ops-600/40">
                <div>
                  <span className="text-ops-muted block">Country</span>
                  <span className="text-ops-text font-medium">
                    {ipData?.country || '–'} {ipData?.countryCode ? `(${ipData.countryCode})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-ops-muted block">State / Region</span>
                  <span className="text-ops-text font-medium">{ipData?.region || '–'}</span>
                </div>
                <div>
                  <span className="text-ops-muted block">City</span>
                  <span className="text-ops-text font-medium">{ipData?.city || '–'}</span>
                </div>
                <div>
                  <span className="text-ops-muted block">Postal Code</span>
                  <span className="text-ops-text font-opsmono">{ipData?.postal || '–'}</span>
                </div>
                <div>
                  <span className="text-ops-muted block">Timezone</span>
                  <span className="text-ops-text truncate block">{ipData?.timezone || '–'}</span>
                </div>
                <div>
                  <span className="text-ops-muted block">Estimated Coordinates</span>
                  <span className="font-opsmono text-sky-400">
                    {Number.isFinite(Number(ipData?.lat)) && Number.isFinite(Number(ipData?.lng))
                      ? `${Number(ipData.lat).toFixed(4)}, ${Number(ipData.lng).toFixed(4)}`
                      : 'Unavailable'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section 3: Device Information */}
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-signal-blue mb-2.5">
                <Cpu size={13} /> Device & User Agent Telemetry
              </h4>
              <div className="rounded-xl bg-ops-950/70 p-3 text-xs border border-ops-600/40 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-ops-muted block">Device Type</span>
                    <span className="capitalize text-ops-text font-medium">{sessionDetail?.deviceType || 'Desktop'}</span>
                  </div>
                  <div>
                    <span className="text-ops-muted block">Operating System</span>
                    <span className="text-ops-text font-medium">{sessionDetail?.os || 'Windows'}</span>
                  </div>
                  <div>
                    <span className="text-ops-muted block">Browser</span>
                    <span className="text-ops-text font-medium">{sessionDetail?.browser || 'Chrome'}</span>
                  </div>
                </div>
                {sessionDetail?.userAgent && (
                  <div>
                    <span className="text-ops-muted block text-[10px]">Raw User Agent</span>
                    <p className="font-opsmono text-[10px] text-ops-muted/80 break-all bg-ops-900 p-1.5 rounded border border-ops-700/50 mt-0.5">
                      {sessionDetail.userAgent}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Authorized GPS Telemetry */}
            <div>
              <h4 className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2.5">
                <span className="flex items-center gap-1.5">
                  <Compass size={13} /> Authorized GPS Telemetry
                </span>
                {gpsData?.permission === 'granted' && gpsData?.sharing ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Tracking
                  </span>
                ) : null}
              </h4>

              {gpsData?.permission === 'granted' && Number.isFinite(Number(gpsData?.lat)) ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl bg-emerald-950/20 border border-emerald-500/30 p-3 text-xs">
                  <div>
                    <span className="text-emerald-400/70 block">GPS Latitude</span>
                    <span className="font-opsmono text-emerald-300 font-semibold">{Number(gpsData.lat).toFixed(5)}°</span>
                  </div>
                  <div>
                    <span className="text-emerald-400/70 block">GPS Longitude</span>
                    <span className="font-opsmono text-emerald-300 font-semibold">{Number(gpsData.lng).toFixed(5)}°</span>
                  </div>
                  <div>
                    <span className="text-emerald-400/70 block">Accuracy</span>
                    <span className="font-opsmono text-emerald-300">±{Math.round(Number(gpsData.accuracy) || 10)}m</span>
                  </div>
                  <div>
                    <span className="text-emerald-400/70 block">Last Updated</span>
                    <span className="text-emerald-300 text-[11px]">
                      {gpsData.updatedAt ? new Date(gpsData.updatedAt).toLocaleTimeString() : 'Just now'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-ops-600/50 bg-ops-950/50 p-3 text-xs text-ops-muted flex items-center gap-2.5">
                  <Info size={16} className="text-ops-muted/70 shrink-0" />
                  <span>
                    {gpsData?.permission === 'denied'
                      ? 'GPS location not shared (Visitor denied browser location permission).'
                      : 'GPS location not shared for this demonstration session. Only approximate IP network coordinates are plotted.'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM CARD: VISITOR LIVE LOCATION MAP (Full-Width) ── */}
      <div className="mt-6 rounded-2xl border border-ops-600 bg-ops-900 shadow-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ops-600/80 bg-ops-950 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Compass size={18} />
            </span>
            <div>
              <h3 className="font-semibold text-sm text-ops-text">Visitor Live Location Map</h3>
              <p className="text-[11px] text-ops-muted">
                Interactive OpenStreetMap rendering showing approximate IP location and real-time authorized GPS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {gpsData?.permission === 'granted' && Number.isFinite(Number(gpsData?.lat)) && (
              <span className="flex items-center gap-1 text-emerald-400 font-medium bg-emerald-950/50 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                <span className="size-2 rounded-full bg-emerald-400 animate-ping" /> Real-time GPS Plotted
              </span>
            )}
            <span className="text-ops-muted">
              Session: <strong className="font-opsmono text-signal-blue">{shortId(selectedVisitorId)}</strong>
            </span>
          </div>
        </div>

        <div className="p-4 bg-ops-950/40">
          <LiveLocationMap
            visitorId={selectedVisitorId}
            ipLocation={ipData}
            gpsLocation={gpsData}
            height={440}
          />
        </div>
      </div>

      {/* ── ALL SESSIONS TABLE WITH REQUEST ACCESS ACTION ── */}
      <Panel
        title="Visitor Sessions Overview"
        className="mt-8"
        action={
          <span className="text-xs text-ops-muted">
            {sessionsData ? `${sessionsData.total} sessions total` : ''}
          </span>
        }
      >
        {sessionsError ? (
          <ErrorNote message={sessionsError} onRetry={reloadSessions} />
        ) : sessionsLoading && !sessionsData ? (
          <div className="py-8 text-center text-sm text-ops-muted">Loading visitor records…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-ops-muted">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Visitor ID</th>
                  <th className="pb-3 pr-4 font-medium">Location</th>
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

                  // Access state
                  const isAccessGranted =
                    isRowLive ||
                    reqStatus?.status === 'accepted' ||
                    (v.cameraPermission === 'granted' && v.gpsPermission === 'granted');
                  const isPending = reqStatus?.status === 'pending';
                  const isDeclined = reqStatus?.status === 'declined';

                  return (
                    <tr
                      key={v.visitorId}
                      className={`hover:bg-ops-700/40 transition cursor-pointer ${
                        isSelected ? 'bg-signal-blue/10 border-l-2 border-signal-blue' : ''
                      }`}
                      onClick={() => setSelectedVisitorId(v.visitorId)}
                    >
                      <td className="whitespace-nowrap py-3 pr-4">
                        <span className="font-opsmono text-signal-blue font-semibold">
                          {shortId(v.visitorId)}
                        </span>
                        {v.isSimulated && <SimBadge />}
                      </td>
                      <td className="py-3 pr-4 text-xs text-ops-text">
                        {v.city ? `${v.city}, ${v.country || ''}` : '–'}
                      </td>
                      <td className="py-3 pr-4">
                        <ConsentBadge value={v.consentDecision} />
                      </td>
                      <td className="py-3 pr-4">
                        <PermissionBadge value={v.cameraPermission} />
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {v.gpsPermission === 'granted' ? (
                          <span className="text-emerald-400 font-medium">● Shared</span>
                        ) : v.gpsPermission === 'denied' ? (
                          <span className="text-rose-400">Denied</span>
                        ) : (
                          <span className="text-ops-muted">–</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {isRowLive ? (
                          <LiveBadge label="Live" />
                        ) : (
                          <span className="text-xs text-ops-muted">Ended</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-xs text-ops-muted">
                        {fmtDate(v.startedAt)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {/* Request Access Action Status / Button */}
                          {isAccessGranted ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 text-xs font-semibold text-emerald-400">
                              <CheckCircle2 size={11} /> Access Granted
                            </span>
                          ) : isPending ? (
                            <span
                              className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-1 text-xs font-medium text-amber-300 animate-pulse"
                              title={`Requested at ${new Date(reqStatus.createdAt).toLocaleTimeString()}`}
                            >
                              <Clock size={11} /> Request Pending
                            </span>
                          ) : isDeclined ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-2 py-1 text-xs font-medium text-rose-400">
                                <XCircle size={11} /> Declined
                              </span>
                              <RequestAccessDropdown
                                visitorId={v.visitorId}
                                onRequest={handleRequestAccess}
                              />
                            </div>
                          ) : (
                            <RequestAccessDropdown
                              visitorId={v.visitorId}
                              onRequest={handleRequestAccess}
                            />
                          )}

                          {/* Inspect / View button */}
                          <button
                            onClick={() => setSelectedVisitorId(v.visitorId)}
                            className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                              isSelected
                                ? 'bg-signal-blue text-white'
                                : 'bg-ops-700 text-ops-text hover:bg-ops-600'
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
