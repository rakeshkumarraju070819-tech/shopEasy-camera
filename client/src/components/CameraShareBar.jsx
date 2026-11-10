import { AlertTriangle, Camera, CameraOff, Compass, Loader2, Square, Video, VideoOff } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CameraShareBar — the only camera/GPS UI surface on the customer storefront.
 *
 * Replaces both custom popups entirely. All browser permission prompts are
 * triggered natively (getUserMedia / getCurrentPosition) with no intermediate
 * custom modal.
 *
 * Layout rules:
 *  • Nothing shown until the customer deliberately clicks "Enable Camera".
 *  • When camera is idle → show a small "Enable Camera" pill in the navbar.
 *  • When awaiting live-video consent → show an inline consent strip
 *    (not a full-screen modal) asking if they want to broadcast video.
 *  • When live → show pulsing "Camera ON" indicator + Stop Sharing.
 *  • Errors → small dismissible notification (never full-screen).
 *  • GPS is fully independent — "Share Location" button appears when live.
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
    startSharing,
    declineLiveVideo,
    stopSharing,
    requestGps,
    stopGps,
  } = useLiveShare();

  // ── 1. Live indicator with Stop controls ─────────────────────────────────
  if (isLive) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-1.5 animate-fadeIn"
      >
        {/* Camera ON pill */}
        <div className="flex items-center gap-1 rounded-lg border border-emerald-500/60 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm leading-none">
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          <Video size={11} className="text-emerald-700 shrink-0" />
          <span>Camera ON</span>
        </div>

        {/* GPS status / add GPS button */}
        {gpsState === 'granted' ? (
          <div className="flex items-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 leading-none">
            <Compass size={10} className="shrink-0" />
            <span>GPS ON</span>
            <button
              onClick={stopGps}
              aria-label="Stop GPS sharing"
              className="ml-0.5 text-emerald-600 hover:text-red-600 transition-colors"
            >
              ×
            </button>
          </div>
        ) : gpsState === 'requesting' ? (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 leading-none">
            <Loader2 size={10} className="animate-spin shrink-0" />
            <span>Location…</span>
          </div>
        ) : gpsState !== 'unavailable' && (
          <button
            onClick={requestGps}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors leading-none"
            aria-label="Share your GPS location with the administrator"
          >
            <Compass size={10} className="shrink-0" />
            Share Location
          </button>
        )}

        {/* Stop sharing */}
        <button
          onClick={stopSharing}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors shadow-sm leading-none"
          aria-label="Stop sharing camera and GPS"
        >
          <Square size={10} className="text-slate-400" />
          Stop Sharing
        </button>
      </div>
    );
  }

  // ── 2. Connecting spinner ─────────────────────────────────────────────────
  if (shareState === 'connecting') {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-700 leading-none">
        <Loader2 size={12} className="animate-spin shrink-0" />
        Connecting…
      </div>
    );
  }

  // ── 3. Awaiting live-video consent ────────────────────────────────────────
  // Camera permission was just granted. We now ask the customer separately
  // whether they want to transmit video to the admin.
  // This is a compact inline strip — NOT a full-screen modal overlay.
  if (shareState === 'awaiting_consent') {
    return (
      <div
        role="alertdialog"
        aria-labelledby="cs-consent-label"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs shadow-sm animate-fadeIn"
      >
        <Camera size={14} className="shrink-0 text-sky-600" />
        <span id="cs-consent-label" className="font-semibold text-sky-900">
          Stream live video to the administrator?
        </span>
        <span className="hidden sm:inline text-sky-700/80 text-[11px]">
          No recording. Stop any time.
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={declineLiveVideo}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            No thanks
          </button>
          <button
            onClick={startSharing}
            className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 transition"
          >
            Start Sharing
          </button>
        </div>
      </div>
    );
  }

  // ── 4. Requesting camera (browser prompt is open) ─────────────────────────
  if (cameraState === 'requesting') {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-700 leading-none">
        <Loader2 size={12} className="animate-spin shrink-0" />
        Allow camera in the browser prompt…
      </div>
    );
  }

  // ── 5. Camera denied ─────────────────────────────────────────────────────
  if (cameraState === 'denied') {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 leading-none animate-fadeIn"
      >
        <CameraOff size={12} className="shrink-0" />
        <span>Camera blocked — allow it in the address bar</span>
        <button
          onClick={dismissCameraError}
          aria-label="Dismiss"
          className="ml-1 text-amber-700 hover:text-amber-900 transition font-bold"
        >
          ×
        </button>
      </div>
    );
  }

  // ── 6. Camera error ───────────────────────────────────────────────────────
  if (cameraState === 'error') {
    const msg =
      cameraError === 'unsupported' ? 'Camera not supported on this device'
      : cameraError === 'busy'      ? 'Camera in use — close other apps and retry'
      : cameraError === 'notfound'  ? 'No camera detected'
      :                               'Camera unavailable';
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-800 leading-none animate-fadeIn"
      >
        <VideoOff size={12} className="shrink-0" />
        <span>{msg}</span>
        <button
          onClick={dismissCameraError}
          aria-label="Dismiss"
          className="ml-1 text-red-600 hover:text-red-800 transition font-bold"
        >
          ×
        </button>
      </div>
    );
  }

  // ── 7. Stopped state — offer to restart ──────────────────────────────────
  if (shareState === 'stopped') {
    return (
      <button
        onClick={requestCamera}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-700 transition-colors leading-none"
        aria-label="Enable camera sharing"
      >
        <Camera size={12} className="shrink-0" />
        Enable Camera
      </button>
    );
  }

  // ── 8. GPS denied notification (independent) ────────────────────────────
  if (gpsState === 'denied' && isLive) {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 leading-none"
      >
        <AlertTriangle size={12} className="shrink-0" />
        Location blocked in browser
      </div>
    );
  }

  // ── 9. Idle — show "Enable Camera" entry point ───────────────────────────
  // Only shown when cameraState is idle (not requesting/granted/denied/error).
  if (cameraState === 'idle') {
    return (
      <button
        onClick={requestCamera}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-700 transition-colors leading-none shrink-0"
        aria-label="Enable camera sharing"
      >
        <Camera size={12} className="shrink-0" />
        Enable Camera
      </button>
    );
  }

  return null;
}
