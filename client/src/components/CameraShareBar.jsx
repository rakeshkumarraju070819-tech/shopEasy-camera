import { AlertTriangle, Camera, CameraOff, Compass, Loader2, ShieldCheck, Video, VideoOff, X } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CameraShareBar — all camera/GPS sharing controls for the navbar.
 *
 * State rendering map:
 *
 *  pending_disclosure  → compact disclosure: "CamShield will share camera & location  Allow | Decline"
 *  camera_requesting   → "Waiting for camera…"
 *  gps_requesting +
 *    gpsState=auto_requesting → "Waiting for location…"
 *    gpsState=needs_gesture   → "Allow location? Allow | Skip"
 *  starting            → "Starting…"
 *  live                → [● Camera ON Stop] [● Location ON Stop / Share Location]
 *  declined            → null (clean navbar)
 *  stopped             → null (clean navbar — no auto-restart)
 *  error               → small error notice + dismiss
 *  cameraState=denied  → amber "Camera blocked" notice
 *  cameraState=error   → red hardware error notice
 *
 * The "Stream live video to the administrator? No thanks / Start Sharing" banner
 * has been REMOVED. The upfront disclosure IS the consent mechanism.
 * After Allow is clicked, permissions are requested and sharing starts automatically.
 */
export default function CameraShareBar() {
  const {
    cameraState,
    cameraError,
    gpsState,
    shareState,
    isLive,
    allowSharing,
    declineSharing,
    requestGps,
    skipGps,
    requestGpsWhileLive,
    dismissCameraError,
    stopSharing,
    stopGps,
  } = useLiveShare();

  // ── 1. LIVE — compact status pills ───────────────────────────────────────
  if (isLive) {
    return (
      <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-1.5">
        {/* Camera ON pill */}
        <div className="flex items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-50 pl-1.5 pr-1 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm leading-none">
          <span className="relative flex size-1.5 shrink-0 mr-0.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          <Video size={10} className="text-emerald-700 shrink-0 mr-0.5" />
          <span>Camera ON</span>
          <button
            onClick={stopSharing}
            aria-label="Stop camera sharing"
            className="ml-1 rounded-full border border-emerald-200 px-1.5 text-[10px] font-bold text-emerald-600 hover:bg-red-100 hover:border-red-200 hover:text-red-700 transition-colors"
          >
            × Stop
          </button>
        </div>

        {/* GPS pill — ON / requesting / add button */}
        {gpsState === 'granted' ? (
          <div className="flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-50 pl-1.5 pr-1 py-1 text-[11px] font-semibold text-emerald-700 leading-none">
            <span className="relative flex size-1.5 shrink-0 mr-0.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            <Compass size={10} className="shrink-0 mr-0.5" />
            <span>Location ON</span>
            <button
              onClick={stopGps}
              aria-label="Stop location sharing"
              className="ml-1 rounded-full border border-emerald-200 px-1.5 text-[10px] font-bold text-emerald-600 hover:bg-red-100 hover:border-red-200 hover:text-red-700 transition-colors"
            >
              × Stop
            </button>
          </div>
        ) : gpsState === 'requesting' || gpsState === 'auto_requesting' ? (
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 leading-none">
            <Loader2 size={10} className="animate-spin shrink-0" />
            <span>Location…</span>
          </div>
        ) : gpsState !== 'unavailable' && gpsState !== 'denied' ? (
          <button
            onClick={requestGpsWhileLive}
            className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors leading-none"
            aria-label="Share your GPS location"
          >
            <Compass size={10} className="shrink-0" />
            Share Location
          </button>
        ) : null}
      </div>
    );
  }

  // ── 2. Starting WebRTC ───────────────────────────────────────────────────
  if (shareState === 'starting') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 leading-none">
        <Loader2 size={11} className="animate-spin shrink-0" />
        Starting…
      </div>
    );
  }

  // ── 3. GPS needs_gesture (browser blocked auto GPS request) ─────────────
  if (shareState === 'gps_requesting' && gpsState === 'needs_gesture') {
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700 leading-none"
      >
        <Compass size={11} className="shrink-0 text-slate-400" />
        <span className="hidden sm:inline">Allow location?</span>
        <button
          onClick={requestGps}
          className="font-semibold text-sky-700 hover:text-sky-900 underline underline-offset-2 transition"
          aria-label="Allow GPS location access"
        >
          Allow
        </button>
        <span className="text-slate-300 mx-0.5">|</span>
        <button
          onClick={skipGps}
          className="text-slate-500 hover:text-slate-700 transition"
          aria-label="Skip location"
        >
          Skip
        </button>
      </div>
    );
  }

  // ── 4. GPS auto-requesting (native GPS prompt open) ──────────────────────
  if (shareState === 'gps_requesting' && (gpsState === 'auto_requesting' || gpsState === 'requesting')) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 leading-none">
        <Loader2 size={11} className="animate-spin shrink-0 text-slate-400" />
        <span className="hidden sm:inline">Waiting for location…</span>
      </div>
    );
  }

  // ── 5. Camera requesting (native camera prompt open) ─────────────────────
  if (shareState === 'camera_requesting' || cameraState === 'requesting') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 leading-none">
        <Loader2 size={11} className="animate-spin shrink-0" />
        <span className="hidden sm:inline">Waiting for camera…</span>
      </div>
    );
  }

  // ── 6. Camera denied ─────────────────────────────────────────────────────
  if (cameraState === 'denied') {
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 leading-none"
      >
        <CameraOff size={11} className="shrink-0" />
        <span>Camera blocked — allow in address bar</span>
        <button
          onClick={dismissCameraError}
          aria-label="Dismiss"
          className="ml-1 font-bold hover:text-amber-900"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  // ── 7. Camera hardware error ─────────────────────────────────────────────
  if (cameraState === 'error' || shareState === 'error') {
    const msg =
      cameraError === 'unsupported' ? 'Camera not supported'
      : cameraError === 'busy'      ? 'Camera in use — close other apps'
      : cameraError === 'notfound'  ? 'No camera detected'
      : cameraError === 'denied'    ? 'Camera blocked — allow in address bar'
      :                               'Camera unavailable';
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-800 leading-none"
      >
        <VideoOff size={11} className="shrink-0" />
        <span className="hidden sm:inline">{msg}</span>
        <button
          onClick={dismissCameraError}
          aria-label="Dismiss"
          className="ml-1 text-red-500 hover:text-red-800 font-bold"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  // ── 8. Camera needs_gesture (browser blocked auto camera trigger) ─────────
  if (cameraState === 'needs_gesture') {
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 leading-none"
      >
        <CameraOff size={11} className="shrink-0 text-slate-400" />
        <span className="hidden sm:inline">Camera access needed —</span>
        <button
          onClick={allowSharing}
          className="underline underline-offset-2 font-semibold text-sky-700 hover:text-sky-900 transition"
        >
          Allow
        </button>
        <button
          onClick={dismissCameraError}
          aria-label="Dismiss"
          className="ml-1 text-slate-400 hover:text-slate-700 font-bold"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  // ── 9. GPS denied notice while live ─────────────────────────────────────
  if (gpsState === 'denied' && isLive) {
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 leading-none"
      >
        <AlertTriangle size={11} className="shrink-0" />
        Location blocked
      </div>
    );
  }

  // ── 10. UPFRONT DISCLOSURE — pending_disclosure ───────────────────────────
  // Compact disclosure shown BEFORE requesting any permission.
  // This is the single consent mechanism — no second Start Sharing banner.
  // Shown on first visit AND on return visits (no suppression).
  if (shareState === 'pending_disclosure') {
    return (
      <div
        role="alertdialog"
        aria-labelledby="cs-disclosure-label"
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] shadow-sm leading-none"
      >
        <ShieldCheck size={12} className="shrink-0 text-sky-600" />
        <span id="cs-disclosure-label" className="hidden lg:inline text-slate-600 font-medium">
          Share camera &amp; location with admin?
        </span>
        <span className="lg:hidden text-slate-500 font-medium">CamShield</span>
        <button
          onClick={allowSharing}
          className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-sky-700 transition leading-normal"
          aria-label="Allow CamShield to share camera and location"
        >
          Allow
        </button>
        <button
          onClick={declineSharing}
          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-50 transition leading-normal"
          aria-label="Decline camera and location sharing"
        >
          Decline
        </button>
      </div>
    );
  }

  // ── 11. Declined / stopped / idle → nothing shown ────────────────────────
  return null;
}
