import { useEffect, useRef } from 'react';
import {
  Camera,
  Compass,
  Loader2,
  ShieldCheck,
  VideoOff,
  X,
  MapPin,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  Info
} from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * Compact, modern multi-step consent modal.
 * White card, light-blue accents, minimal layout.
 * Each permission independently optional.
 */
export default function LiveShareConsentModal() {
  const {
    phase,
    cameraError,
    stream,
    gpsPermission,
    decline,
    requestPermission,
    retryPermission,
    acceptGps,
    skipGps,
    startSharing
  } = useLiveShare();

  const panelRef = useRef(null);
  const previewVideoRef = useRef(null);

  const visible = [
    'idle', 'requesting', 'gps_prompt', 'requesting_gps',
    'confirming', 'starting', 'permDenied', 'permError'
  ].includes(phase);

  // Attach customer self-preview stream when confirming
  useEffect(() => {
    const el = previewVideoRef.current;
    if (el && stream && phase === 'confirming') {
      el.srcObject = stream;
      el.muted = true;
      el.play().catch((err) => {
        console.warn('[LiveShareModal] Preview autoplay prevented:', err);
      });
    }
  }, [stream, phase]);

  // Trap focus
  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && phase === 'idle') decline();
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll('button:not([disabled]), a[href]');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (visible) panelRef.current?.querySelector('[data-autofocus]')?.focus();
  }, [visible, phase]);

  if (!visible) return null;

  // Determine error details for permDenied and permError
  const effectiveError = phase === 'permDenied' ? 'denied' : (cameraError || 'error');

  const errorConfig = {
    denied: {
      title: 'Camera permission blocked',
      desc: 'Your browser has blocked camera access for this site. You can unblock it to share your camera or keep shopping normally.',
      showChromeGuide: true,
      canRetry: true
    },
    notfound: {
      title: 'No camera detected',
      desc: 'No camera device was detected on your device. Please ensure your camera is connected and enabled, then try again.',
      showChromeGuide: false,
      canRetry: true
    },
    busy: {
      title: 'Camera in use',
      desc: 'Another application or tab is currently using your camera. Please close other video apps (Zoom, Teams, Meet) and try again.',
      showChromeGuide: false,
      canRetry: true
    },
    overconstrained: {
      title: 'Camera settings adjusted',
      desc: 'Your camera does not support high-definition video constraints. We have adjusted to standard settings.',
      showChromeGuide: false,
      canRetry: true
    },
    security: {
      title: 'Security restriction',
      desc: 'Camera access is blocked by browser security restrictions. Camera sharing requires a secure HTTPS connection.',
      showChromeGuide: false,
      canRetry: false
    },
    unsupported: {
      title: 'Camera not supported',
      desc: 'This browser does not support WebRTC camera streaming. Please open this website in Google Chrome, Microsoft Edge, or Safari.',
      showChromeGuide: false,
      canRetry: false
    },
    network: {
      title: 'Connection error',
      desc: 'Could not connect to the security demonstration server. Please check your internet connection and try again.',
      showChromeGuide: false,
      canRetry: true
    },
    error: {
      title: 'Camera temporarily unavailable',
      desc: 'We could not access your camera. It may be restricted by system permissions, an external application, or privacy software.',
      showChromeGuide: true,
      canRetry: true
    }
  }[effectiveError] || {
    title: 'Camera unavailable',
    desc: 'We could not access your camera. It may be blocked or unavailable.',
    showChromeGuide: true,
    canRetry: true
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/40 backdrop-blur-[3px]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-modal-title"
        className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden"
      >
        {/* ── Step 1: Camera + GPS Permission Setup ── */}
        {phase === 'idle' && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-sky-100 text-sky-600">
                  <ShieldCheck size={15} />
                </span>
                <span className="font-semibold text-sm text-slate-800">Permission Setup</span>
              </div>
              <button
                onClick={decline}
                aria-label="Dismiss"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <h2 id="cs-modal-title" className="text-base font-bold text-slate-800 leading-snug">
                Improve your shopping experience
              </h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                A quick permission setup. Both are optional.
              </p>

              {/* Permission rows */}
              <div className="mt-3 space-y-2">
                {/* Camera row */}
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-600">
                    <Camera size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">Camera access</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Your live camera feed will be shared with an authorized administrator. No recording.
                    </p>
                  </div>
                </div>

                {/* GPS row */}
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-600">
                    <MapPin size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">Location access</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Your GPS coordinates will be shared with the authorized administrator.
                    </p>
                  </div>
                </div>
              </div>

              {/* Disclosure note */}
              <p className="mt-3 text-[10px] text-slate-400 leading-relaxed">
                You can decline either permission. Your answer is saved for this session only.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={decline}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Skip
              </button>
              <button
                data-autofocus
                onClick={requestPermission}
                className="flex-1 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition"
              >
                Continue
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Requesting camera permission ── */}
        {phase === 'requesting' && (
          <div className="flex flex-col items-center py-8 px-5 text-center" role="status">
            <Loader2 className="animate-spin text-sky-600 mb-3" size={28} />
            <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">Waiting for camera permission</h2>
            <p className="mt-1 text-xs text-slate-500">Look for the prompt near your address bar and click <strong>Allow</strong>.</p>
          </div>
        )}

        {/* ── Step 3: GPS consent (after camera granted) ── */}
        {phase === 'gps_prompt' && (
          <>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-emerald-100 text-emerald-600">
                  <Compass size={15} />
                </span>
                <span className="font-semibold text-sm text-slate-800">Location access</span>
              </div>
              <button onClick={skipGps} aria-label="Skip GPS" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 transition">
                <X size={15} />
              </button>
            </div>

            <div className="px-4 py-3">
              <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">Share your GPS location?</h2>
              <p className="mt-1 text-xs text-slate-500">
                Camera access was approved. Would you also share your GPS location with the authorized administrator?
              </p>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-xs text-slate-600">
                <MapPin size={13} className="shrink-0 mt-0.5 text-emerald-600" />
                <span>Completely optional. If skipped, only your approximate IP network area is shown.</span>
              </div>
            </div>

            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={skipGps}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Skip GPS
              </button>
              <button
                data-autofocus
                onClick={acceptGps}
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition"
              >
                Share GPS
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Waiting for browser GPS prompt ── */}
        {phase === 'requesting_gps' && (
          <div className="flex flex-col items-center py-8 px-5 text-center" role="status">
            <Loader2 className="animate-spin text-emerald-600 mb-3" size={28} />
            <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">Waiting for location permission</h2>
            <p className="mt-1 text-xs text-slate-500">Check the prompt near your address bar.</p>
          </div>
        )}

        {/* ── Step 5: Ready to go live (confirmation with self-preview) ── */}
        {phase === 'confirming' && (
          <>
            <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
              <span className="grid size-7 place-items-center rounded-lg bg-green-100 text-green-600">
                <CheckCircle2 size={15} />
              </span>
              <span className="font-semibold text-sm text-slate-800">Ready to share</span>
            </div>

            <div className="px-4 py-3">
              {/* Optional live self-preview */}
              {stream && (
                <div className="relative aspect-video w-full mb-3 rounded-xl overflow-hidden bg-black shadow-inner border border-slate-200">
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="size-full object-cover -scale-x-100"
                  />
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Preview Live
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                Click <strong>Start Sharing</strong> to begin broadcasting to the authorized administrator.
                You can stop at any time.
              </p>
              <div className="rounded-xl border border-slate-100 bg-slate-50 divide-y divide-slate-100 text-xs">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-slate-500">Camera Feed</span>
                  <span className="font-semibold text-green-700">● Authorized</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-slate-500">GPS Sharing</span>
                  <span className={`font-semibold ${gpsPermission === 'granted' ? 'text-green-700' : 'text-slate-400'}`}>
                    {gpsPermission === 'granted' ? '● GPS Enabled' : '○ Skipped'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={decline}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                data-autofocus
                onClick={startSharing}
                className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 transition"
              >
                Start Sharing
              </button>
            </div>
          </>
        )}

        {/* ── Step 6: Connecting ── */}
        {phase === 'starting' && (
          <div className="flex flex-col items-center py-8 px-5 text-center" role="status">
            <Loader2 className="animate-spin text-sky-600 mb-3" size={28} />
            <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">Connecting…</h2>
            <p className="mt-1 text-xs text-slate-500">Establishing secure connection with administrator.</p>
          </div>
        )}

        {/* ── Error States: Handled accurately per error category ── */}
        {(phase === 'permDenied' || phase === 'permError') && (
          <div className="px-4 py-5">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-600 mb-3">
              {effectiveError === 'security' ? <ShieldAlert size={18} /> : <VideoOff size={18} />}
            </span>
            <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">
              {errorConfig.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {errorConfig.desc}
            </p>

            {/* Chrome site settings unblock guide */}
            {errorConfig.showChromeGuide && (
              <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700 flex items-center gap-1">
                  <Info size={12} className="text-sky-600 shrink-0" />
                  How to unblock in Chrome:
                </p>
                <ol className="list-decimal list-inside space-y-0.5 text-[10px] text-slate-500">
                  <li>Tap the <strong>tune/lock icon</strong> on the address bar</li>
                  <li>Open <strong>Permissions</strong> or <strong>Site settings</strong></li>
                  <li>Change <strong>Camera</strong> to <strong>Allow</strong></li>
                  <li>Click <strong>Try Again</strong> below</li>
                </ol>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={decline}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Continue Shopping
              </button>
              {errorConfig.canRetry && (
                <button
                  data-autofocus
                  onClick={retryPermission}
                  className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition"
                >
                  <RotateCcw size={12} />
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
