import { useState, useRef, useEffect } from 'react';
import { Camera, Square } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CameraShareBar — camera icon in the navbar.
 *
 * DESIGN:
 * - Icon is always navy/dark, same colour as the cart icon.
 * - A tiny green pulsing dot appears at the top-right corner ONLY when
 *   live video sharing is actually active (shareState === 'live').
 * - Red static dot when camera permission is explicitly denied.
 * - Amber pulsing dot when waiting for a user gesture to trigger the prompt.
 * - No "Camera ON" text, no green background, no coloured icon.
 * - Clicking only opens the popover when isLive === true (the compact
 *   "Camera sharing active / Stop sharing" panel from the reference design).
 */
export default function CameraShareBar() {
  const { cameraState, isLive, stopSharing } = useLiveShare();

  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef  = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    if (!showPopover) return;
    const onOutside = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        buttonRef.current  && !buttonRef.current.contains(e.target)
      ) setShowPopover(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [showPopover]);

  const isDenied     = cameraState === 'denied';
  const needsGesture = cameraState === 'needs_gesture';

  const handleStop = () => {
    stopSharing();
    setShowPopover(false);
  };

  const handleIconClick = () => {
    // Only open the popover when actually live — that's the only state worth surfacing.
    if (isLive) setShowPopover((v) => !v);
  };

  return (
    <div className="relative">
      {/* ── Navbar button — always the same dark-navy style as the cart icon ── */}
      <button
        ref={buttonRef}
        onClick={handleIconClick}
        className="relative rounded-full border border-line p-2.5 text-navy-700 hover:border-brand-500 hover:text-brand-600 transition-colors"
        aria-label={
          isLive       ? 'Camera sharing active — click to stop' :
          isDenied     ? 'Camera access denied' :
          needsGesture ? 'Camera awaiting permission' :
                         'Camera'
        }
        aria-expanded={showPopover}
        aria-haspopup={isLive ? 'dialog' : undefined}
      >
        {/* Camera icon — always dark navy, never green */}
        <Camera size={20} />

        {/* Tiny green pulsing dot — ONLY when isLive */}
        {isLive && (
          <span className="absolute right-1 top-1 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        )}

        {/* Tiny red dot — permission denied */}
        {isDenied && !isLive && (
          <span className="absolute right-1 top-1 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        )}

        {/* Tiny amber pulsing dot — needs user gesture */}
        {needsGesture && !isLive && !isDenied && (
          <span className="absolute right-1 top-1 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
        )}
      </button>

      {/* ── Compact popover — only rendered when isLive ── */}
      {showPopover && isLive && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Camera sharing controls"
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
        >
          {/* Status row */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-100">
              <Camera size={12} className="text-emerald-600" />
            </span>
            <span className="text-xs font-medium text-slate-800">Camera sharing active</span>
          </div>

          <div className="mx-3 my-1 border-t border-slate-100" />

          {/* Stop sharing */}
          <button
            onClick={handleStop}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-red-100">
              <Square size={10} className="fill-red-600 text-red-600" />
            </span>
            Stop sharing
          </button>
        </div>
      )}
    </div>
  );
}
