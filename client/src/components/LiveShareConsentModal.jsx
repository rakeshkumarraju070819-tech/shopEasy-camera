import { useEffect, useRef } from 'react';
import { Camera, Compass, Loader2, MapPin, ShieldCheck, VideoOff, X } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * Multi-step customer consent modal for live camera + optional GPS demonstration.
 * Flow:
 *  1. Camera consent (idle)
 *  2. Camera browser prompt (requesting)
 *  3. GPS location consent (gps_prompt)
 *  4. GPS browser prompt (requesting_gps)
 *  5. Final confirmation (confirming)
 *  6. Starting broadcast (starting)
 */
export default function LiveShareConsentModal() {
  const {
    phase,
    cameraError,
    gpsPermission,
    decline,
    requestPermission,
    acceptGps,
    skipGps,
    startSharing
  } = useLiveShare();

  const panelRef = useRef(null);

  const visible = [
    'idle',
    'requesting',
    'gps_prompt',
    'requesting_gps',
    'confirming',
    'starting',
    'permDenied',
    'permError'
  ].includes(phase);

  // Trap focus inside the dialog
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
    <div className="fixed inset-0 z-50 grid place-items-end bg-navy-950/60 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-modal-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-8"
      >
        {/* ── Step 1: Camera Consent ── */}
        {phase === 'idle' && (
          <>
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sky-100 text-brand-600">
                <Camera size={26} />
              </span>
              <button
                onClick={decline}
                aria-label="Dismiss – same as No, Continue Shopping"
                className="rounded-full p-2 text-navy-500 hover:bg-sky-50"
              >
                <X size={20} />
              </button>
            </div>

            <h2 id="cs-modal-title" className="mt-4 text-2xl font-extrabold text-navy-900">
              Camera Access Request
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-navy-600">
              Would you like to participate in the CamShield live camera privacy demonstration?
            </p>

            <ul className="mt-5 space-y-3 rounded-2xl bg-sky-50 p-4 text-sm leading-relaxed text-navy-700">
              <li className="flex items-start gap-3">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
                <span>This demonstration is <strong>optional</strong> and not required for shopping.</span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
                <span>If you agree, your camera will be shared <strong>live</strong> with an authorized demonstration administrator.</span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
                <span><strong>No video will be recorded or stored.</strong></span>
              </li>
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <button
                data-autofocus
                onClick={requestPermission}
                className="flex-1 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
              >
                Yes, Participate
              </button>
              <button
                onClick={decline}
                className="flex-1 rounded-xl border border-line px-5 py-3 font-semibold text-navy-700 hover:bg-sky-50"
              >
                No, Continue Shopping
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Waiting for browser camera permission ── */}
        {phase === 'requesting' && (
          <div className="py-8 text-center" role="status">
            <Loader2 className="mx-auto animate-spin text-brand-600" size={40} />
            <h2 id="cs-modal-title" className="mt-5 text-xl font-extrabold text-navy-900">
              Waiting for camera permission
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-navy-600">
              Look for the camera permission prompt near the address bar and click <strong>Allow</strong>.
            </p>
          </div>
        )}

        {/* ── Step 3: Separate GPS Location Consent ── */}
        {phase === 'gps_prompt' && (
          <>
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-600">
                <Compass size={26} />
              </span>
              <button
                onClick={skipGps}
                aria-label="Skip GPS"
                className="rounded-full p-2 text-navy-500 hover:bg-sky-50"
              >
                <X size={20} />
              </button>
            </div>

            <h2 id="cs-modal-title" className="mt-4 text-2xl font-extrabold text-navy-900">
              GPS Location Demonstration
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-navy-600">
              Camera access is approved. Would you also like to participate in our optional live GPS demonstration?
            </p>

            <ul className="mt-4 space-y-3 rounded-2xl bg-emerald-50/70 p-4 text-sm leading-relaxed text-navy-700">
              <li className="flex items-start gap-3">
                <MapPin size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>Shows a live GPS pin on the admin security map to demonstrate location intelligence.</span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span><strong>Completely optional</strong>. If skipped, only the approximate network IP area is shown.</span>
              </li>
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <button
                data-autofocus
                onClick={acceptGps}
                className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
              >
                Yes, Share GPS
              </button>
              <button
                onClick={skipGps}
                className="flex-1 rounded-xl border border-line px-5 py-3 font-semibold text-navy-700 hover:bg-sky-50"
              >
                No, Skip GPS
              </button>
            </div>
          </>
        )}

        {/* ── Step 4: Waiting for browser GPS prompt ── */}
        {phase === 'requesting_gps' && (
          <div className="py-8 text-center" role="status">
            <Loader2 className="mx-auto animate-spin text-emerald-600" size={40} />
            <h2 id="cs-modal-title" className="mt-5 text-xl font-extrabold text-navy-900">
              Waiting for location prompt
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-navy-600">
              Look for the browser location prompt near your address bar and select your choice.
            </p>
          </div>
        )}

        {/* ── Step 5: Final confirmation before going live ── */}
        {phase === 'confirming' && (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-green-100 text-green-600">
              <Camera size={26} />
            </span>
            <h2 id="cs-modal-title" className="mt-4 text-2xl font-extrabold text-navy-900">
              Ready to go live
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-navy-700">
              Permissions are set. Click <strong>Start Live Sharing</strong> to begin broadcasting to the authorized administrator. You can stop sharing at any time.
            </p>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-navy-800">
              <div className="flex justify-between">
                <span className="text-navy-500">Camera Feed:</span>
                <span className="font-semibold text-green-700">● Live Authorized</span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">GPS Sharing:</span>
                <span className={`font-semibold ${gpsPermission === 'granted' ? 'text-green-700' : 'text-slate-500'}`}>
                  {gpsPermission === 'granted' ? '● GPS Enabled' : '○ Not Shared (IP only)'}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <button
                data-autofocus
                onClick={startSharing}
                className="flex-1 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700"
              >
                Start Live Sharing
              </button>
              <button
                onClick={decline}
                className="flex-1 rounded-xl border border-line px-5 py-3 font-semibold text-navy-700 hover:bg-sky-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ── Step 6: Initialising stream ── */}
        {phase === 'starting' && (
          <div className="py-8 text-center" role="status">
            <Loader2 className="mx-auto animate-spin text-brand-600" size={40} />
            <h2 id="cs-modal-title" className="mt-5 text-xl font-extrabold text-navy-900">
              Starting live session…
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-navy-600">
              Connecting with the administrator console.
            </p>
          </div>
        )}

        {/* ── Error: Permission denied ── */}
        {phase === 'permDenied' && (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-sky-100 text-navy-600">
              <VideoOff size={26} />
            </span>
            <h2 id="cs-modal-title" className="mt-4 text-2xl font-extrabold text-navy-900">
              Camera not enabled
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-navy-700">
              Your browser blocked camera access, so nothing was turned on. You can keep shopping normally.
            </p>
            <button
              data-autofocus
              onClick={decline}
              className="mt-6 w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Continue Shopping
            </button>
          </>
        )}

        {/* ── Error: Camera unavailable / other ── */}
        {phase === 'permError' && (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-sky-100 text-navy-600">
              <VideoOff size={26} />
            </span>
            <h2 id="cs-modal-title" className="mt-4 text-2xl font-extrabold text-navy-900">
              {cameraError === 'unsupported' ? 'Camera not available' : 'No camera found'}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-navy-700">
              {cameraError === 'unsupported'
                ? 'This browser or connection does not support camera access. Camera sharing requires HTTPS or localhost.'
                : 'We could not access your camera. It may be in use by another app or unavailable.'}
            </p>
            <button
              data-autofocus
              onClick={decline}
              className="mt-6 w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Continue Shopping
            </button>
          </>
        )}
      </div>
    </div>
  );
}
