import { useEffect, useState } from 'react';
import { Camera, Check, Compass, ShieldAlert, X } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * Customer popup for incoming Administrator Access Requests.
 * Displays when an authorized administrator requests Camera or GPS access.
 */
export default function AdminAccessRequestModal() {
  const { pendingAccessRequest, acceptAccessRequest, declineAccessRequest } = useLiveShare();
  const [processing, setProcessing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);

  // Countdown timer for request expiration
  useEffect(() => {
    if (!pendingAccessRequest) return;
    const expiresAt = pendingAccessRequest.expiresAt || Date.now() + 60000;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [pendingAccessRequest]);

  if (!pendingAccessRequest) return null;

  const isCameraRequested =
    pendingAccessRequest.requestType === 'camera' || pendingAccessRequest.requestType === 'both';
  const isGpsRequested =
    pendingAccessRequest.requestType === 'gps' || pendingAccessRequest.requestType === 'both';

  const handleAccept = async () => {
    setProcessing(true);
    try {
      await acceptAccessRequest(pendingAccessRequest);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = () => {
    declineAccessRequest(pendingAccessRequest);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/65 p-4 backdrop-blur-[3px] animate-fadeIn">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-req-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600">
              <ShieldAlert size={20} />
            </span>
            <div>
              <h2 id="access-req-title" className="text-base font-bold text-navy-900 leading-tight">
                Security Demonstration Access Request
              </h2>
              <p className="text-xs text-navy-500">Live privacy demonstration notice</p>
            </div>
          </div>

          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            Expires in {timeLeft}s
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm leading-relaxed text-navy-700">
            The CamShield administrator is requesting permission to access your camera and/or location for the live privacy demonstration.
          </p>

          {/* Breakdown of what is being requested */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-slate-200/80 pb-2.5">
              <span className="text-navy-500 font-medium">Administrator Identity</span>
              <span className="font-semibold text-navy-900 font-opsmono">
                {pendingAccessRequest.adminEmail || 'admin@camshield.com'}
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-200/80 pb-2.5">
              <span className="text-navy-500 font-medium">Demonstration Purpose</span>
              <span className="font-semibold text-navy-800">
                {pendingAccessRequest.purpose || 'Live privacy & security demonstration'}
              </span>
            </div>

            <div className="flex justify-between items-center border-b border-slate-200/80 pb-2.5">
              <span className="flex items-center gap-1.5 font-medium text-navy-700">
                <Camera size={14} className="text-brand-600" />
                Camera Video Stream
              </span>
              <span
                className={`font-bold px-2 py-0.5 rounded ${
                  isCameraRequested
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                {isCameraRequested ? 'Requested' : 'Not requested'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1.5 font-medium text-navy-700">
                <Compass size={14} className="text-emerald-600" />
                Real-Time GPS Location
              </span>
              <span
                className={`font-bold px-2 py-0.5 rounded ${
                  isGpsRequested
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                {isGpsRequested ? 'Requested' : 'Not requested'}
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-sky-50/70 border border-sky-100 p-3 text-[11px] leading-relaxed text-navy-600">
            🔒 <strong>Your Privacy:</strong> If you accept, your browser will still ask for native permission. You can stop sharing at any time using the header controls. No video will be recorded.
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button
            onClick={handleDecline}
            disabled={processing}
            className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-navy-700 hover:bg-slate-100 transition-colors"
          >
            Decline Request
          </button>
          <button
            onClick={handleAccept}
            disabled={processing}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-brand-700 shadow transition-colors disabled:opacity-60"
          >
            {processing ? (
              'Processing…'
            ) : (
              <>
                <Check size={14} /> Accept Request
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

