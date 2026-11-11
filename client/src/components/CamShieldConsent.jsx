import { ShieldCheck, Video, X } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CamShieldConsent
 *
 * One-time, non-blocking disclosure shown before the native camera prompt.
 * Tells the customer exactly what will be shared and with whom.
 *
 * "Allow & Share" → giveConsent(true)  → permissionManager requests camera
 * "No thanks"     → giveConsent(false) → dismiss overlay, no camera requested
 *
 * Shown only once per browser (localStorage flag).
 */
export default function CamShieldConsent() {
  const { showConsent, giveConsent } = useLiveShare();

  if (!showConsent) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cs-consent-title"
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8">
        {/* Icon */}
        <span className="inline-grid size-12 place-items-center rounded-2xl bg-sky-100 text-brand-600">
          <ShieldCheck size={26} />
        </span>

        <h2 id="cs-consent-title" className="mt-4 text-xl font-extrabold text-navy-900">
          CamShield Security Demo
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-navy-700">
          This site includes a live security demonstration. If you agree, your
          camera video will be shared in real time with an{' '}
          <strong>authenticated CamShield administrator</strong> for the duration
          of your visit.
        </p>

        <ul className="mt-4 space-y-2 rounded-2xl bg-sky-50 p-4 text-sm text-navy-700">
          <li className="flex items-start gap-2">
            <Video size={16} className="mt-0.5 shrink-0 text-brand-600" />
            <span>Live video only — nothing is recorded or stored.</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-600" />
            <span>Encrypted WebRTC connection. Admin-only access.</span>
          </li>
          <li className="flex items-start gap-2">
            <X size={16} className="mt-0.5 shrink-0 text-brand-600" />
            <span>Stop sharing any time by tapping the camera icon.</span>
          </li>
        </ul>

        <p className="mt-3 text-xs text-slate-500">
          Clicking <strong>Allow &amp; Share</strong> will trigger your
          browser's camera permission prompt. Sharing starts only after you
          allow it there too.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button
            onClick={() => giveConsent(true)}
            className="flex-1 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Allow &amp; Share
          </button>
          <button
            onClick={() => giveConsent(false)}
            className="flex-1 rounded-xl border border-line px-5 py-3 text-sm font-semibold text-navy-700 hover:bg-sky-50"
          >
            No thanks, continue shopping
          </button>
        </div>
      </div>
    </div>
  );
}
