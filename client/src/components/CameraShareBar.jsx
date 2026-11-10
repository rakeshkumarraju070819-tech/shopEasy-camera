import { AlertTriangle, Camera, CameraOff, Compass, Loader2, Square, Video, VideoOff } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CameraShareBar — the only camera/GPS UI surface on the customer storefront.
 *
 * Rendering rules
 * ───────────────
 * idle            → null (nothing shown; auto-trigger is in progress or not needed)
 * requesting      → small spinner "Waiting for camera…"
 * needs_gesture   → small unobtrusive notice + a single "Allow Camera" link
 *                   (browser blocked the auto-trigger; user gesture required)
 * denied          → small amber notice (browser blocked; how to fix)
 * error           → small red notice (hardware issue, specific message)
 * awaiting_consent→ inline consent strip asking about live-video sharing
 * connecting      → small spinner "Connecting…"
 * live            → pulsing "Camera ON" badge + GPS controls + Stop Sharing
 * stopped         → null (customer ended the session; no button to restart)
 *
 * GPS controls appear only while live.
 * No full-screen modals, no overlays, no camera preview.
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

  // ── 1. Live — pulsing indicator + GPS controls + Stop ────────────────────
  if (isLive) {
    return (
      <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-1.5 animate-fadeIn">
        {/* Camera ON pill */}
        <div className="flex items-center gap-1 rounded-lg border border-emerald-500/60 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm leading-none">
          <span className="relative flex size-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          <Video size={11} className="text-emerald-700 shrink-0" />
          <span>Camera ON</span>
        </div>

        {/* GPS: on / requesting / add */}
        {gpsState === 'granted' ? (
          <div className="flex items-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 leading-none">
            <Compass size={10} className="shrink-0" />
            <span>GPS ON</span>
            <button onClick={stopGps} aria-label="Stop GPS sharing"
              className="ml-0.5 text-emerald-600 hover:text-red-600 transition-colors">×</button>
          </div>
        ) : gpsState === 'requesting' ? (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 leading-none">
            <Loader2 size={10} className="animate-spin shrink-0" /><span>Location…</span>
          </div>
        ) : gpsState !== 'unavailable' ? (
          <button onClick={requestGps}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors leading-none"
            aria-label="Share your GPS location with the administrator">
            <Compass size={10} className="shrink-0" />Share Location
          </button>
        ) : null}

        {/* Stop sharing */}
        <button onClick={stopSharing}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors shadow-sm leading-none"
          aria-label="Stop camera and GPS sharing">
          <Square size={10} className="text-slate-400" />Stop Sharing
        </button>
      </div>
    );
  }

  // ── 2. WebRTC connecting ─────────────────────────────────────────────────
  if (shareState === 'connecting') {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-700 leading-none">
        <Loader2 size={12} className="animate-spin shrink-0" />Connecting…
      </div>
    );
  }

  // ── 3. Awaiting live-video consent ───────────────────────────────────────
  // Camera permission granted. Asking separately whether to stream to admin.
  // Compact inline strip — not a modal.
  if (shareState === 'awaiting_consent') {
    return (
      <div role="alertdialog" aria-labelledby="cs-consent-label"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs shadow-sm animate-fadeIn">
        <Camera size={14} className="shrink-0 text-sky-600" />
        <span id="cs-consent-label" className="font-semibold text-sky-900">
          Stream live video to the administrator?
        </span>
        <span className="hidden sm:inline text-sky-700/80 text-[11px]">No recording. Stop any time.</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={declineLiveVideo}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition">
            No thanks
          </button>
          <button onClick={startSharing}
            className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 transition">
            Start Sharing
          </button>
        </div>
      </div>
    );
  }

  // ── 4. Browser prompt in progress ───────────────────────────────────────
  if (cameraState === 'requesting') {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-700 leading-none">
        <Loader2 size={12} className="animate-spin shrink-0" />
        Waiting for camera…
      </div>
    );
  }

  // ── 5. Needs gesture — browser blocked auto-trigger ──────────────────────
  // The site attempted getUserMedia on load but the browser requires a user
  // action first. Show a small unobtrusive notice with a single retry link.
  if (cameraState === 'needs_gesture') {
    return (
      <div role="alert"
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 leading-none animate-fadeIn">
        <CameraOff size={12} className="shrink-0 text-slate-400" />
        <span>Camera access needed —</span>
        <button onClick={requestCamera}
          className="underline underline-offset-2 font-semibold text-sky-700 hover:text-sky-900 transition">
          Allow
        </button>
        <button onClick={dismissCameraError} aria-label="Dismiss"
          className="ml-1 text-slate-400 hover:text-slate-700 transition font-bold">×</button>
      </div>
    );
  }

  // ── 6. Camera denied ────────────────────────────────────────────────────
  if (cameraState === 'denied') {
    return (
      <div role="alert"
        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 leading-none animate-fadeIn">
        <CameraOff size={12} className="shrink-0" />
        <span>Camera blocked — allow it in the address bar</span>
        <button onClick={dismissCameraError} aria-label="Dismiss"
          className="ml-1 text-amber-700 hover:text-amber-900 transition font-bold">×</button>
      </div>
    );
  }

  // ── 7. Camera hardware error ─────────────────────────────────────────────
  if (cameraState === 'error') {
    const msg =
      cameraError === 'unsupported' ? 'Camera not supported on this device'
      : cameraError === 'busy'      ? 'Camera in use — close other apps'
      : cameraError === 'notfound'  ? 'No camera detected'
      :                               'Camera unavailable';
    return (
      <div role="alert"
        className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-800 leading-none animate-fadeIn">
        <VideoOff size={12} className="shrink-0" />
        <span>{msg}</span>
        {(cameraError === 'busy' || cameraError === 'notfound') && (
          <button onClick={requestCamera}
            className="underline underline-offset-2 font-semibold hover:text-red-900 transition ml-1">
            Retry
          </button>
        )}
        <button onClick={dismissCameraError} aria-label="Dismiss"
          className="ml-1 text-red-500 hover:text-red-800 transition font-bold">×</button>
      </div>
    );
  }

  // ── 8. GPS denied (while live) ───────────────────────────────────────────
  if (gpsState === 'denied' && isLive) {
    return (
      <div role="alert"
        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 leading-none">
        <AlertTriangle size={12} className="shrink-0" />Location blocked in browser
      </div>
    );
  }

  // ── 9. idle / stopped / granted (but awaiting_consent already shown) ─────
  // Render nothing — no persistent camera button in the navbar.
  return null;
}
