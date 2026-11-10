import { AlertTriangle, Camera, CameraOff, Compass, Loader2, Video, VideoOff, X } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CameraShareBar — sequential camera-then-GPS permission controls in the navbar.
 *
 * Renders null when inactive (idle/stopped) so it takes zero navbar space.
 *
 * Sequential flow rendering:
 *
 *  cameraState='requesting'              → "Waiting for camera…"
 *  cameraState='needs_gesture'           → "Camera access needed — Allow ×"
 *  cameraState='denied'                  → "Camera blocked — allow in address bar ×"
 *  cameraState='error'                   → specific error + optional Retry ×
 *
 *  gpsState='auto_requesting'            → "Waiting for location…"  (after camera granted)
 *  gpsState='needs_gesture'              → "Allow location →  Skip"  (browser blocked auto GPS)
 *
 *  shareState='awaiting_consent'         → "Stream live video to admin? No thanks / Start Sharing"
 *  shareState='connecting'               → "Connecting…"
 *
 *  isLive=true                           → [● Camera ON  Stop] [● Location ON  Stop] / [Share Location]
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
    startSharing,
    declineLiveVideo,
    stopSharing,
    stopGps,
  } = useLiveShare();

  // ── 1. Live — Camera ON + GPS ON/off + Stop ───────────────────────────────
  if (isLive) {
    return (
      <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-1.5">
        {/* Camera ON pill */}
        <div className="flex items-center gap-1 rounded-lg border border-emerald-500/60 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm leading-none">
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          <Video size={11} className="text-emerald-700 shrink-0" />
          <span>Camera ON</span>
          <button
            onClick={stopSharing}
            aria-label="Stop camera sharing"
            className="ml-1 rounded px-1 text-[10px] font-bold text-emerald-700 hover:bg-red-100 hover:text-red-700 transition-colors"
          >
            Stop
          </button>
        </div>

        {/* GPS: ON with stop / requesting / Share Location button */}
        {gpsState === 'granted' ? (
          <div className="flex items-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 leading-none">
            <span className="relative flex size-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            <Compass size={10} className="shrink-0" />
            <span>Location ON</span>
            <button
              onClick={stopGps}
              aria-label="Stop location sharing"
              className="ml-1 rounded px-1 text-[10px] font-bold text-emerald-700 hover:bg-red-100 hover:text-red-700 transition-colors"
            >
              Stop
            </button>
          </div>
        ) : gpsState === 'requesting' || gpsState === 'auto_requesting' ? (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 leading-none">
            <Loader2 size={10} className="animate-spin shrink-0" />
            <span>Location…</span>
          </div>
        ) : gpsState !== 'unavailable' && gpsState !== 'denied' ? (
          <button
            onClick={requestGps}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors leading-none"
            aria-label="Share your GPS location with the administrator"
          >
            <Compass size={10} className="shrink-0" />
            Share Location
          </button>
        ) : null}
      </div>
    );
  }

  // ── 2. WebRTC connecting ─────────────────────────────────────────────────
  if (shareState === 'connecting') {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-700 leading-none">
        <Loader2 size={12} className="animate-spin shrink-0" />
        Connecting…
      </div>
    );
  }

  // ── 3. Awaiting live-video consent (after both permission attempts) ───────
  // Both permissions have been attempted. Now ask the customer whether to
  // actually transmit video (and GPS if granted) to the administrator.
  if (shareState === 'awaiting_consent') {
    return (
      <div
        role="alertdialog"
        aria-labelledby="cs-consent-label"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs shadow-sm"
      >
        <Camera size={14} className="shrink-0 text-sky-600" />
        <span id="cs-consent-label" className="font-semibold text-sky-900">
          Stream live video to the administrator?
        </span>
        <span className="hidden lg:inline text-sky-700/80 text-[11px]">
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

  // ── 4. GPS needs_gesture — browser blocked the auto GPS request ──────────
  // Camera was granted and GPS was auto-attempted but Chrome required a user
  // gesture. Show "Allow location → Skip" so the customer can proceed.
  // This appears inline in the navbar — no popup, no modal.
  if (gpsState === 'needs_gesture' && cameraState === 'granted') {
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 leading-none"
      >
        <Compass size={12} className="shrink-0 text-slate-400" />
        <span>Allow location?</span>
        <button
          onClick={requestGps}
          className="underline underline-offset-2 font-semibold text-sky-700 hover:text-sky-900 transition"
          aria-label="Allow GPS location access"
        >
          Allow
        </button>
        <span className="text-slate-300">|</span>
        <button
          onClick={skipGps}
          className="text-slate-500 hover:text-slate-700 transition text-[10px]"
          aria-label="Skip location, continue without GPS"
        >
          Skip
        </button>
      </div>
    );
  }

  // ── 5. GPS auto-requesting (waiting for native GPS prompt) ───────────────
  if (gpsState === 'auto_requesting') {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 leading-none">
        <Loader2 size={12} className="animate-spin shrink-0 text-slate-400" />
        Waiting for location…
      </div>
    );
  }

  // ── 6. Browser camera prompt open ───────────────────────────────────────
  if (cameraState === 'requesting') {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-700 leading-none">
        <Loader2 size={12} className="animate-spin shrink-0" />
        Waiting for camera…
      </div>
    );
  }

  // ── 7. Camera needs_gesture ──────────────────────────────────────────────
  if (cameraState === 'needs_gesture') {
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 leading-none"
      >
        <CameraOff size={12} className="shrink-0 text-slate-400" />
        <span>Camera access needed —</span>
        <button
          onClick={requestCamera}
          className="underline underline-offset-2 font-semibold text-sky-700 hover:text-sky-900 transition"
        >
          Allow
        </button>
        <button
          onClick={dismissCameraError}
          aria-label="Dismiss"
          className="ml-1 text-slate-400 hover:text-slate-700 transition font-bold"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // ── 8. Camera denied ─────────────────────────────────────────────────────
  if (cameraState === 'denied') {
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 leading-none"
      >
        <CameraOff size={12} className="shrink-0" />
        <span>Camera blocked — allow in address bar</span>
        <button
          onClick={dismissCameraError}
          aria-label="Dismiss"
          className="ml-1 font-bold hover:text-amber-900"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // ── 9. Camera hardware error ─────────────────────────────────────────────
  if (cameraState === 'error') {
    const msg =
      cameraError === 'unsupported' ? 'Camera not supported'
      : cameraError === 'busy'      ? 'Camera in use — close other apps'
      : cameraError === 'notfound'  ? 'No camera detected'
      :                               'Camera unavailable';
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-800 leading-none"
      >
        <VideoOff size={12} className="shrink-0" />
        <span>{msg}</span>
        {(cameraError === 'busy' || cameraError === 'notfound') && (
          <button
            onClick={requestCamera}
            className="underline underline-offset-2 font-semibold hover:text-red-900 ml-1"
          >
            Retry
          </button>
        )}
        <button
          onClick={dismissCameraError}
          aria-label="Dismiss"
          className="ml-1 text-red-500 hover:text-red-800 font-bold"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // ── 10. GPS denied while live ────────────────────────────────────────────
  if (gpsState === 'denied' && isLive) {
    return (
      <div
        role="alert"
        className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 leading-none"
      >
        <AlertTriangle size={12} className="shrink-0" />
        Location blocked
      </div>
    );
  }

  // ── 11. Idle / stopped / no actionable state → invisible ─────────────────
  return null;
}
