import { useEffect, useRef } from 'react';
import { Camera, Compass, Loader2, ShieldCheck, VideoOff, X, MapPin, RefreshCw } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * Simplified multi-step consent modal.
 *
 * Steps shown:
 *  1. idle        — initial camera + GPS permission setup card
 *  2. requesting  — waiting for browser camera permission
 *  3. gps_prompt  — camera granted; optionally share GPS
 *  4. requesting_gps — waiting for browser GPS permission
 *  5. starting    — connecting WebRTC (goes straight from GPS decision)
 *  6. permDenied  — browser blocked camera
 *  7. permError   — camera unavailable / busy / not found
 *
 * The "Ready to share / Start Sharing" confirmation screen (phase 'confirming')
 * has been removed. After the GPS step, sharing starts automatically.
 */
export default function LiveShareConsentModal() {
  const {
    phase,
    cameraError,
    decline,
    requestPermission,
    acceptGps,
    skipGps,
    retryPermission,
  } = useLiveShare();

  const panelRef = useRef(null);

  const visible = [
    'idle', 'requesting', 'gps_prompt', 'requesting_gps',
    'starting', 'permDenied', 'permError'
  ].includes(phase);

  // Trap focus inside modal
  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && phase === 'idle') decline();
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll('button:not([disabled]), a[href]');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (visible) panelRef.current?.querySelector('[data-autofocus]')?.focus();
  }, [visible, phase]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 bg-black/40 backdrop-blur-[3px]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-modal-title"
        className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden"
      >

        {/* ── Step 1: Initial consent (camera + GPS overview) ── */}
        {phase === 'idle' && (
          <>
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

            <div className="px-4 py-3">
              <h2 id="cs-modal-title" className="text-base font-bold text-slate-800 leading-snug">
                Improve your shopping experience
              </h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Share your camera live with an authorised store representative. Both are optional — you can stop at any time.
              </p>

              <div className="mt-3 space-y-2">
                {/* Camera row */}
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-600">
                    <Camera size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">Camera access</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Your live camera feed will be shared with an authorised administrator. No recording is made.
                    </p>
                  </div>
                </div>

                {/* GPS row */}
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-600">
                    <MapPin size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">Location access <span className="font-normal text-slate-400">(optional)</span></p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Your GPS coordinates will be shared with the administrator. You will be asked separately.
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[10px] text-slate-400 leading-relaxed">
                Clicking <strong>Allow &amp; Continue</strong> opens the browser's native camera permission prompt.
                Granting camera access does <em>not</em> start live video — you must also allow live sharing when asked next.
              </p>
            </div>

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
                Allow &amp; Continue
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Waiting for browser camera permission ── */}
        {phase === 'requesting' && (
          <div className="flex flex-col items-center py-8 px-5 text-center" role="status">
            <Loader2 className="animate-spin text-sky-600 mb-3" size={28} />
            <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">Waiting for camera permission</h2>
            <p className="mt-1 text-xs text-slate-500">
              Look for the browser prompt near your address bar and click <strong>Allow</strong>.
            </p>
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
                <span className="font-semibold text-sm text-slate-800">Share your location?</span>
              </div>
              <button
                onClick={skipGps}
                aria-label="Skip GPS"
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-4 py-3">
              <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">
                Camera access granted — start live sharing?
              </h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Your camera feed will be broadcast to the administrator as soon as you tap a button below.
                You can optionally share your GPS location too.
              </p>
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-xs text-slate-600">
                <MapPin size={13} className="shrink-0 mt-0.5 text-emerald-600" />
                <span>GPS sharing is completely optional. If you skip it, only your approximate IP-based area is shown.</span>
              </div>
            </div>

            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={skipGps}
                className="flex-1 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition"
              >
                Start Sharing (no GPS)
              </button>
              <button
                data-autofocus
                onClick={acceptGps}
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition"
              >
                Share GPS &amp; Start
              </button>
            </div>
            <div className="px-4 pb-3">
              <button
                onClick={decline}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition"
              >
                Cancel — continue shopping
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Waiting for browser GPS permission ── */}
        {phase === 'requesting_gps' && (
          <div className="flex flex-col items-center py-8 px-5 text-center" role="status">
            <Loader2 className="animate-spin text-emerald-600 mb-3" size={28} />
            <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">Waiting for location permission</h2>
            <p className="mt-1 text-xs text-slate-500">Check the browser prompt near your address bar.</p>
          </div>
        )}

        {/* ── Step 5: Connecting WebRTC ── */}
        {phase === 'starting' && (
          <div className="flex flex-col items-center py-8 px-5 text-center" role="status">
            <Loader2 className="animate-spin text-sky-600 mb-3" size={28} />
            <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">Starting live sharing…</h2>
            <p className="mt-1 text-xs text-slate-500">Establishing a secure connection. This takes just a moment.</p>
          </div>
        )}

        {/* ── Error: Permission denied by browser ── */}
        {phase === 'permDenied' && (
          <div className="px-4 py-5">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500 mb-3">
              <VideoOff size={18} />
            </span>
            <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">Camera access blocked</h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Your browser blocked camera access. To allow it, click the camera icon in your address bar and choose <strong>Allow</strong>, then refresh the page.
            </p>
            <button
              data-autofocus
              onClick={decline}
              className="mt-4 w-full rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition"
            >
              Continue Shopping
            </button>
          </div>
        )}

        {/* ── Error: Camera unavailable / busy / not found / unsupported ── */}
        {phase === 'permError' && (
          <div className="px-4 py-5">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500 mb-3">
              <VideoOff size={18} />
            </span>
            <h2 id="cs-modal-title" className="text-sm font-bold text-slate-800">
              {cameraError === 'unsupported' ? 'Camera not supported'
                : cameraError === 'busy' ? 'Camera in use by another app'
                : cameraError === 'notfound' ? 'No camera detected'
                : 'Camera unavailable'}
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              {cameraError === 'unsupported'
                ? 'Camera sharing requires a secure (HTTPS) connection or localhost.'
                : cameraError === 'busy'
                ? 'Your camera is being used by another application. Close it and try again.'
                : cameraError === 'notfound'
                ? 'No webcam was detected on this device. Connect a camera and try again.'
                : 'Your camera could not be accessed. It may be blocked or temporarily unavailable.'}
            </p>
            {/* Only show Retry when it makes sense — busy or notfound */}
            {(cameraError === 'busy' || cameraError === 'notfound') && (
              <button
                onClick={retryPermission}
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={12} />
                Try Again
              </button>
            )}
            <button
              data-autofocus
              onClick={decline}
              className="mt-2 w-full rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition"
            >
              Continue Shopping
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
