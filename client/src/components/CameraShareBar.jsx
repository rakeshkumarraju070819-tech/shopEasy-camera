import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Video,
  MapPin,
  StopCircle,
  X,
  AlertCircle,
  Settings,
  ShieldCheck,
  PlayCircle,
  Navigation,
} from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CameraShareBar — compact camera icon with status indicator and consent popover.
 *
 * DESIGN:
 * - Small camera icon always visible in the navbar, before the cart icon.
 * - Neutral icon when camera permission is granted but sharing hasn't started.
 * - Tiny green status dot when live video sharing is active.
 * - Red dot when camera permission is denied.
 * - Amber dot when camera needs a user gesture.
 * - No "Camera ON" / "Location ON" text labels.
 * - Tapping the icon opens a compact status panel with sharing controls.
 *
 * CONSENT MODEL:
 * Browser permission (native prompt) is separate from sharing consent.
 * The user must explicitly click "Start Live Video Sharing" and
 * "Share My Location" to authorize transmission to the admin.
 */
export default function CameraShareBar() {
  const {
    cameraState,
    gpsState,
    shareState,
    gpsShareState,
    isLive,
    isGpsLive,
    startSharing,
    stopSharing,
    startGpsSharing,
    stopGps,
    requestCamera,
  } = useLiveShare();

  const [showPopover, setShowPopover] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setShowPopover(false);
      }
    };
    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopover]);

  const isDenied = cameraState === 'denied';
  const needsGesture = cameraState === 'needs_gesture';
  const cameraGranted = cameraState === 'granted';
  const cameraStarting = shareState === 'starting';

  // Handle "Start Live Video Sharing" — explicit consent
  const handleStartSharing = async () => {
    setShareBusy(true);
    try {
      await startSharing();
    } finally {
      setShareBusy(false);
    }
  };

  // Handle "Share My Location" — explicit consent
  const handleStartGps = async () => {
    setGpsBusy(true);
    try {
      await startGpsSharing();
    } finally {
      setGpsBusy(false);
    }
  };

  const handleStopSharing = () => {
    stopSharing();
  };

  const handleStopGps = () => {
    stopGps();
  };

  const handleAllowCamera = async () => {
    await requestCamera();
  };

  return (
    <div className="relative">
      {/* ── Camera Icon Button — ALWAYS visible ── */}
      <button
        ref={buttonRef}
        onClick={() => setShowPopover(!showPopover)}
        className={`relative rounded-full border p-2.5 transition-colors ${
          isDenied
            ? 'border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50'
            : isLive
            ? 'border-emerald-200 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50'
            : 'border-line text-navy-700 hover:border-brand-500 hover:text-brand-600'
        }`}
        aria-label={
          isLive
            ? 'Camera sharing active — click for controls'
            : isDenied
            ? 'Camera access denied — click for help'
            : needsGesture
            ? 'Click to allow camera'
            : cameraGranted
            ? 'Camera ready — click to start sharing'
            : 'Camera — click for status'
        }
        aria-expanded={showPopover}
      >
        <Camera size={20} />

        {/* Green active indicator dot */}
        {isLive && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        )}

        {/* Red denied indicator */}
        {isDenied && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        )}

        {/* Amber needs-gesture indicator */}
        {needsGesture && !isLive && !isDenied && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
        )}
      </button>

      {/* ── Popover ── */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-line bg-white shadow-xl z-50"
          role="dialog"
          aria-label="Camera and location sharing controls"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
              <ShieldCheck size={15} className="text-brand-600" />
              CamShield Status
            </h3>
            <button
              onClick={() => setShowPopover(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-3 space-y-4">
            {/* ── CAMERA SECTION ── */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    isLive ? 'bg-emerald-50' : cameraGranted ? 'bg-sky-50' : isDenied ? 'bg-red-50' : 'bg-slate-100'
                  }`}
                >
                  <Video
                    size={16}
                    className={
                      isLive ? 'text-emerald-600' : cameraGranted ? 'text-sky-600' : isDenied ? 'text-red-600' : 'text-slate-400'
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-navy-900">Camera</div>
                  <div className="text-xs text-slate-500">
                    {isLive
                      ? 'Live video sharing active'
                      : shareState === 'starting'
                      ? 'Starting broadcast...'
                      : cameraGranted
                      ? 'Permission granted — not sharing'
                      : needsGesture
                      ? 'Awaiting browser permission'
                      : cameraState === 'checking' || cameraState === 'requesting'
                      ? 'Requesting permission...'
                      : isDenied
                      ? 'Permission denied'
                      : cameraState === 'error'
                      ? 'Camera error'
                      : 'Not requested'}
                  </div>
                </div>
              </div>

              {/* Camera status dot */}
              <div className="ml-12 flex items-center gap-1.5 mb-2">
                {isLive && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Streaming to admin
                  </span>
                )}
                {cameraGranted && !isLive && shareState !== 'starting' && (
                  <span className="flex items-center gap-1 text-xs text-sky-600">
                    <span className="inline-flex h-2 w-2 rounded-full bg-sky-400" />
                    Ready to share
                  </span>
                )}
              </div>

              {/* Camera action button */}
              {isLive ? (
                <button
                  onClick={handleStopSharing}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
                >
                  <StopCircle size={15} />
                  Stop Video Sharing
                </button>
              ) : cameraGranted && shareState !== 'starting' ? (
                <button
                  onClick={handleStartSharing}
                  disabled={shareBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                >
                  <PlayCircle size={15} />
                  {shareBusy ? 'Starting...' : 'Start Live Video Sharing'}
                </button>
              ) : shareState === 'starting' ? (
                <div className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-600">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                  Starting broadcast...
                </div>
              ) : needsGesture ? (
                <button
                  onClick={handleAllowCamera}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  <Camera size={15} />
                  Allow Camera
                </button>
              ) : isDenied ? (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                  <p className="text-xs text-red-700">
                    Camera was denied. Click the <Settings size={11} className="inline" /> lock icon in your address bar
                    → Site settings → Camera → Allow, then refresh.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Divider */}
            <div className="border-t border-line" />

            {/* ── GPS / LOCATION SECTION ── */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    isGpsLive ? 'bg-emerald-50' : gpsState === 'granted' ? 'bg-sky-50' : gpsState === 'denied' ? 'bg-red-50' : 'bg-slate-100'
                  }`}
                >
                  <MapPin
                    size={16}
                    className={
                      isGpsLive ? 'text-emerald-600' : gpsState === 'granted' ? 'text-sky-600' : gpsState === 'denied' ? 'text-red-600' : 'text-slate-400'
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-navy-900">Location</div>
                  <div className="text-xs text-slate-500">
                    {isGpsLive
                      ? 'Location sharing active'
                      : gpsState === 'granted'
                      ? 'Permission granted — not sharing'
                      : gpsState === 'checking' || gpsState === 'requesting'
                      ? 'Requesting permission...'
                      : gpsState === 'denied'
                      ? 'Permission denied'
                      : gpsState === 'unavailable'
                      ? 'Not available on this device'
                      : 'Not requested'}
                  </div>
                </div>
              </div>

              {/* GPS status dot */}
              <div className="ml-12 flex items-center gap-1.5 mb-2">
                {isGpsLive && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Sending to admin
                  </span>
                )}
                {gpsState === 'granted' && !isGpsLive && (
                  <span className="flex items-center gap-1 text-xs text-sky-600">
                    <span className="inline-flex h-2 w-2 rounded-full bg-sky-400" />
                    Ready to share
                  </span>
                )}
              </div>

              {/* GPS action button */}
              {isGpsLive ? (
                <button
                  onClick={handleStopGps}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
                >
                  <StopCircle size={15} />
                  Stop Location Sharing
                </button>
              ) : gpsState === 'granted' ? (
                <button
                  onClick={handleStartGps}
                  disabled={gpsBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                >
                  <Navigation size={15} />
                  {gpsBusy ? 'Starting...' : 'Share My Location'}
                </button>
              ) : gpsState === 'denied' ? (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                  <p className="text-xs text-red-700">
                    Location was denied. Click the <Settings size={11} className="inline" /> lock icon in your address bar
                    → Site settings → Location → Allow, then refresh.
                  </p>
                </div>
              ) : gpsState === 'unavailable' ? (
                <p className="text-xs text-slate-500 text-center py-1">
                  Geolocation is not available on this device.
                </p>
              ) : null}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-line px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck size={11} />
              Browser permission does not auto-share. You control when sharing starts and stops.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
