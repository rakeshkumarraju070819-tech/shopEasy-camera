import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck, VideoOff, X } from 'lucide-react';
import { useConsent } from '../context/ConsentContext';
import { probeCameraPermission } from '../services/camera';

const RESULT_COPY = {
  denied: ['Camera not enabled', 'Your browser blocked camera access, so nothing was turned on. You can keep shopping as normal. If you change your mind, use “Privacy choices” in the page footer.'],
  unsupported: ['Camera not available here', 'This browser or connection cannot use a camera. (Browsers only allow it on secure HTTPS or localhost pages.) Nothing was turned on, and you can keep shopping as normal.'],
  error: ['No camera available', 'We could not start a camera. It may be missing or in use by another app. Nothing was turned on, and you can keep shopping as normal.']
};

/**
 * The optional camera-demo notification. It never touches the camera by itself:
 * the browser's real permission prompt is only triggered after the visitor chooses
 * “Yes” AND clicks “Show browser prompt” on the explanation step.
 */
export default function ConsentModal() {
  const { needsChoice, choose, dismissReopen, reportPermission } = useConsent();
  const navigate = useNavigate();
  const [step, setStep] = useState('ask'); // ask | explain | requesting | denied | unsupported | error
  const [busy, setBusy] = useState(false);
  const panelRef = useRef(null);

  const inFlow = step !== 'ask';
  const visible = needsChoice || inFlow;

  const finish = () => { setStep('ask'); dismissReopen(); };
  const decline = async () => { setBusy(true); await choose('declined'); setBusy(false); setStep('ask'); };
  const accept = async () => { setBusy(true); await choose('accepted'); setBusy(false); setStep('explain'); };

  const showBrowserPrompt = async () => {
    setStep('requesting');
    const result = await probeCameraPermission(); // genuine browser prompt; camera released immediately
    reportPermission(result);
    if (result === 'granted') { finish(); navigate('/camera-test', { state: { autostart: true } }); }
    else setStep(result);
  };

  // Escape = decline on the first step; keep focus inside the dialog
  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && step === 'ask' && !busy) decline();
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

  useEffect(() => { if (visible) panelRef.current?.querySelector('[data-autofocus]')?.focus(); }, [visible, step]);

  if (!visible) return null;
  const result = RESULT_COPY[step];

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-navy-950/55 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="consent-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-8">

        {step === 'ask' && (
          <>
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sky-100 text-brand-600"><ShieldCheck size={26} /></span>
              <button onClick={decline} disabled={busy} aria-label="Dismiss – same as No, Continue Shopping" className="rounded-full p-2 text-navy-500 hover:bg-sky-50"><X size={20} /></button>
            </div>
            <h2 id="consent-title" className="mt-4 text-2xl font-extrabold">Camera Access Request</h2>
            <p className="mt-3 leading-relaxed text-navy-700">
              Would you like to enable your camera for the CamShield privacy demonstration? This is optional and is not required for shopping.
              If enabled, your camera will be used only during the test. No video will be recorded or transmitted.
            </p>
            <div className="mt-5 space-y-3 rounded-2xl bg-sky-50 p-4 text-sm leading-relaxed text-navy-700">
              <p><strong className="text-navy-900">Why we’re asking.</strong> The demo shows how a website asks for camera permission and what you stay in control of. It has nothing to do with your order.</p>
              <p><strong className="text-navy-900">Your privacy.</strong> If you say yes you’ll see a live preview with a Stop button. Nothing is recorded, saved or sent anywhere.</p>
              <p><strong className="text-navy-900">What we log.</strong> Whichever you choose, we save your answer plus your IP address, approximate location and browser type for the demo dashboard.</p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <button data-autofocus onClick={accept} disabled={busy} className="flex-1 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {busy ? 'Saving…' : 'Yes, Allow Camera'}
              </button>
              <button onClick={decline} disabled={busy} className="flex-1 rounded-xl border border-line px-5 py-3 font-semibold text-navy-700 hover:bg-sky-50 disabled:opacity-60">
                No, Continue Shopping
              </button>
            </div>
          </>
        )}

        {step === 'explain' && (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-sky-100 text-brand-600"><ShieldCheck size={26} /></span>
            <h2 id="consent-title" className="mt-4 text-2xl font-extrabold">Your browser will ask next</h2>
            <p className="mt-3 leading-relaxed text-navy-700">
              Your choice is saved. When you continue, your browser shows its own permission prompt. Select <strong>Allow</strong> to open the test page, or <strong>Block</strong> if you’ve changed your mind. The camera stays off until you allow it.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
              <button data-autofocus onClick={showBrowserPrompt} className="flex-1 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Show browser prompt</button>
              <button onClick={decline} disabled={busy} className="flex-1 rounded-xl border border-line px-5 py-3 font-semibold text-navy-700 hover:bg-sky-50">Cancel, continue shopping</button>
            </div>
          </>
        )}

        {step === 'requesting' && (
          <div className="py-6 text-center" role="status">
            <Loader2 className="mx-auto animate-spin text-brand-600" size={36} />
            <h2 id="consent-title" className="mt-4 text-xl font-extrabold">Waiting for your browser</h2>
            <p className="mt-2 text-sm text-navy-700">Look for the permission prompt near the address bar and choose Allow or Block.</p>
          </div>
        )}

        {result && (
          <>
            <span className="grid size-12 place-items-center rounded-2xl bg-sky-100 text-navy-700"><VideoOff size={26} /></span>
            <h2 id="consent-title" className="mt-4 text-2xl font-extrabold">{result[0]}</h2>
            <p className="mt-3 leading-relaxed text-navy-700">{result[1]}</p>
            <button data-autofocus onClick={finish} className="mt-6 w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Continue shopping</button>
          </>
        )}
      </div>
    </div>
  );
}
