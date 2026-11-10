import { AlertTriangle, Camera, CameraOff, Compass, Loader2, Video, VideoOff, X } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CameraShareBar — compact inline navbar element.
 *
 * REMOVED: All custom permission popups, Allow/Decline buttons,
 *          "Start Sharing" banners, "Stream live video?" prompts.
 *
 * What it shows:
 *
 *   idle / camera_requesting  → spinning "Waiting for camera…" (non-interactive)
 *   gps_requesting (auto)     → spinning "Waiting for location…" (non-interactive)
 *   needs_gesture (camera)    → one-pill "Allow camera" button (browser blocked auto)
 *   needs_gesture (GPS)       → one-pill "Allow | Skip" (browser blocked auto GPS)
 *   starting                  → spinning "Starting…" (non-interactive)
 *   live                      → [● Camera ON × Stop]  [● Location ON × Stop]
 *   stopped / idle            → null (nothing shown)
 *   denied / error            → small dismissible notice
 *
 * The disclosure is a separate static text rendered by StoreLayout.
 * No buttons request permission on behalf of the browser.
 * Native Chrome prompt IS the permission UI.
 */
export default function CameraShareBar() {
  const {
    cameraState,
    cameraError,
    gpsState,
    shareState,
    isLive,
    requestCamera,
    dismissCameraError,
    requestGps,
    skipGps,
    requestGpsWhileLive,
    stopSharing,
    stopGps,
  } = useLiveShare();

  // ── LIVE ─────────────────────────────────────────────────────────────────
  if (isLive) {
    return (
      <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-1.5">
        {/* Camera ON */}
        <div className="flex items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-50 pl-2 pr-1 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm leading-none">
          <span className="relative flex size-1.5 shrink-0 mr-0.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          <Video size={10} className="text-emerald-700 shrink-0 mr-0.5" />
          <span>Camera ON</span>
          <button
            onClick={stopSharing}
            aria-label="Stop sharing"
            className="ml-1 rounded-full border border-emerald-200 px-1.5 text-[10px] font-bold text-emerald-600 hover:bg-red-100 hover:border-red-200 hover:text-red-700 transition-colors leading-normal"
          >
            × Stop
          </button>
        </div>

        {/* GPS: ON / requesting / add */}
        {gpsState === 'granted' && (
          <div className="flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-50 pl-2 pr-1 py-1 text-[11px] font-semibold text-emerald-700 leading-none">
            <span className="relative flex size-1.5 shrink-0 mr-0.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            <Compass size={10} className="shrink-0 mr-0.5" />
            <span>Location ON</span>
            <button
              onClick={stopGps}
              aria-label="Stop location sharing"
              className="ml-1 rounded-full border border-emerald-200 px-1.5 text-[10px] font-bold text-emerald-600 hover:bg-red-100 hover:border-red-200 hover:text-red-700 transition-colors leading-normal"
            >
              × Stop
            </button>
          </div>
        )}

        {(gpsState === 'requesting' || gpsState === 'auto_requesting') && (
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 leading-none">
            <Loader2 size={10} className="animate-spin shrink-0" />
            <span>Location…</span>
          </div>
        )}

        {gpsState === 'idle' && (
          <button
            onClick={requestGpsWhileLive}
            className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors leading-none"
            aria-label="Share your GPS location"
          >
            <Compass size={10} className="shrink-0" />
            <span className="hidden sm:inline">Share Location</span>
          </button>
        )}
      </div>
    );
  }

  // ── STARTING ─────────────────────────────────────────────────────────────
  if (shareState === 'starting') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 leading-none" role="status">
        <Loader2 size={11} className="animate-spin shrink-0" />
        <span className="hidden sm:inline">Starting…</span>
      </div>
    );
  }

  // ── GPS needs_gesture — browser blocked auto GPS, needs user tap ─────────
  if (shareState === 'gps_requesting' && gpsState === 'needs_gesture') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 leading-none" role="alert">
        <Compass size={11} className="shrink-0 text-slate-400" />
        <span className="hidden sm:inline">Location access:</span>
        <button
          onClick={requestGps}
          className="font-semibold text-sky-700 hover:text-sky-900 underline underline-offset-2"
          aria-label="Allow location access"
        >
          Allow
        </button>
        <span className="text-slate-300">|</span>
        <button onClick={skipGps} className="text-slate-400 hover:text-slate-600" aria-label="Skip location">
          Skip
        </button>
      </div>
    );
  }

  // ── GPS requesting spinner ────────────────────────────────────────────────
  if (shareState === 'gps_requesting' && (gpsState === 'auto_requesting' || gpsState === 'requesting')) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 leading-none" role="status">
        <Loader2 size={11} className="animate-spin shrink-0" />
        <span className="hidden sm:inline">Waiting for location…</span>
      </div>
    );
  }

  // ── CAMERA requesting spinner ─────────────────────────────────────────────
  if (shareState === 'camera_requesting' || cameraState === 'requesting') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 leading-none" role="status">
        <Loader2 size={11} className="animate-spin shrink-0" />
        <span className="hidden sm:inline">Waiting for camera…</span>
      </div>
    );
  }

  // ── Camera needs_gesture — minimal single-action fallback ─────────────────
  // The browser blocked the automatic getUserMedia call.
  // Show ONE small pill. Clicking it triggers getUserMedia directly — this IS
  // the user gesture that satisfies the browser's requirement.
  // This is not a custom popup; it is a minimal fallback as required.
  if (cameraState === 'needs_gesture') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] leading-none" role="alert">
        <Camera size={11} className="shrink-0 text-sky-500" />
        <button
          onClick={requestCamera}
          className="font-semibold text-sky-700 hover:text-sky-900 underline underline-offset-2"
          aria-label="Allow camera access"
        >
          Allow camera
        </button>
        <button onClick={dismissCameraError} aria-label="Dismiss" className="ml-1 text-slate-300 hover:text-slate-600">
          <X size={11} />
        </button>
      </div>
    );
  }

  // ── Camera denied ─────────────────────────────────────────────────────────
  if (cameraState === 'denied') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 leading-none" role="alert">
        <CameraOff size={11} className="shrink-0" />
        <span className="hidden sm:inline">Camera blocked — allow in address bar</span>
        <button onClick={dismissCameraError} aria-label="Dismiss" className="ml-1 hover:text-amber-900">
          <X size={11} />
        </button>
      </div>
    );
  }

  // ── Camera / share error ─────────────────────────────────────────────────
  if (cameraState === 'error' || shareState === 'error') {
    const msg = cameraError === 'unsupported' ? 'Camera not supported'
      : cameraError === 'busy'    ? 'Camera in use'
      : cameraError === 'notfound'? 'No camera found'
      :                              'Camera unavailable';
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-800 leading-none" role="alert">
        <VideoOff size={11} className="shrink-0" />
        <span className="hidden sm:inline">{msg}</span>
        <button onClick={dismissCameraError} aria-label="Dismiss" className="ml-1 text-red-400 hover:text-red-800">
          <X size={11} />
        </button>
      </div>
    );
  }

  // ── GPS denied while live ─────────────────────────────────────────────────
  if (gpsState === 'denied' && isLive) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 leading-none" role="alert">
        <AlertTriangle size={11} className="shrink-0" />
        <span className="hidden sm:inline">Location blocked</span>
      </div>
    );
  }

  // ── Idle / stopped / declined → nothing shown ────────────────────────────
  return null;
}
