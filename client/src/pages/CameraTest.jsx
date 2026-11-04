import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CameraOff, ShieldCheck, Video } from 'lucide-react';
import useCamera from '../hooks/useCamera';
import { useConsent } from '../context/ConsentContext';

const MESSAGES = {
  denied: 'Your browser blocked camera access, so nothing was turned on. To try again, allow the camera in your browser’s site settings.',
  unsupported: 'This browser or connection cannot use a camera. Browsers only allow it on secure (HTTPS or localhost) pages.',
  error: 'We could not start a camera. It may be missing or in use by another app.'
};

/**
 * Dedicated, clearly explained test screen.
 * The video is shown only in this tab: it is never recorded, stored or transmitted.
 */
export default function CameraTest() {
  const { decision, choose, reportPermission, reportCameraActive } = useConsent();
  const location = useLocation();
  const navigate = useNavigate();
  const { status, start, stop, videoRef } = useCamera({ onPermission: reportPermission, onActive: reportCameraActive });

  // Arrived straight from the consent flow (permission already granted) → start the preview once.
  useEffect(() => {
    if (location.state?.autostart && decision === 'accepted') {
      start();
      navigate(location.pathname, { replace: true, state: null }); // a reload must not auto-start again
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = async () => {
    if (decision !== 'accepted') await choose('accepted');
    start();
  };

  const active = status === 'active';
  const requesting = status === 'requesting';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold">CamShield camera test</h1>
      <p className="mt-2 max-w-prose text-navy-700">
        This optional demo shows what a website sees when you allow camera access. It is separate from shopping, and you can leave at any time.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-5">
        <div className="md:col-span-3">
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-navy-950">
            {active && (
              <>
                <video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview" className="size-full -scale-x-100 object-cover" />
                <span role="status" className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white">
                  <span className="rec-dot size-2.5 rounded-full bg-red-500" /> Camera is on
                </span>
              </>
            )}
            {!active && (
              <div className="grid size-full place-items-center p-6 text-center text-sky-200">
                <div>
                  {status === 'idle' || requesting ? <Video size={44} className="mx-auto" /> : <CameraOff size={44} className="mx-auto" />}
                  <p className="mt-3 font-semibold" role="status">
                    {requesting ? 'Waiting for your browser…' : status === 'stopped' ? 'Camera stopped' : 'Camera is off'}
                  </p>
                  {MESSAGES[status] && <p className="mt-2 text-sm text-sky-300">{MESSAGES[status]}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {active ? (
              <button onClick={stop} className="rounded-xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700">Stop Camera</button>
            ) : (
              <button onClick={begin} disabled={requesting} className="rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                {status === 'stopped' ? 'Start again' : 'Start camera test'}
              </button>
            )}
            <Link to="/" className="rounded-xl border border-line px-6 py-3 font-semibold text-navy-700 hover:bg-sky-50">Back to shopping</Link>
          </div>
        </div>

        <aside className="rounded-3xl bg-sky-50 p-6 text-sm leading-relaxed text-navy-700 md:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-navy-900"><ShieldCheck size={20} className="text-brand-600" /> What this test does</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>Shows your camera on this page so you can see exactly what is being captured.</li>
            <li>Nothing is recorded, saved or sent anywhere. The preview exists only in your browser.</li>
            <li>Stop Camera turns it off straight away. Leaving this page also turns it off.</li>
            <li>Our dashboard records only whether you agreed and what your browser answered, never any video.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
