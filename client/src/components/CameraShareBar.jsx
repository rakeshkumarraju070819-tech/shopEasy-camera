import { useState, useRef, useEffect } from 'react';
import { Camera, Square } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CameraShareBar — small camera icon in the navbar with a compact popover.
 *
 * NAVBAR ICON:
 *   - Always visible beside the cart icon.
 *   - Green pulsing dot when live video sharing is active.
 *   - Red dot when camera permission is denied.
 *   - Amber pulsing dot when waiting for a user gesture.
 *   - No text labels ever shown next to the icon.
 *
 * POPOVER (matches Screenshot 2):
 *   - White, rounded, shadow, ~170 px wide.
 *   - When live: green camera icon + "Camera sharing active" + red "Stop sharing" button.
 *   - When not live: nothing shown (popover does not open when there is nothing to stop).
 *
 * GPS sharing runs in the background independently and is not surfaced here.
 */
export default function CameraShareBar() {
  const { cameraState, shareState, isLive, stopSharing } = useLiveShare();

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
    stopSharing();   // stops WebRTC + camera tracks; GPS continues independently
    setShowPopover(false);
  };

  // Only open the popover when the camera is actively sharing — that's the
  // only state the popover surfaces (Screenshot 2 shows the live state).
  const handleIconClick = () => {
    if (isLive) setShowPopover((v) => !v);
    // When not live, tapping the icon does nothing visible.
    // The browser has already shown its native permission prompt; the icon
    // is purely a live-status indicator and stop control.
  };

  return (
    <div className="relative">
      {/* ── Navbar camera icon button — always visible ── */}
      <button
        ref={buttonRef}
        onClick={handleIconClick}
        className={`relative rounded-full border p-2.5 transition-colors ${
          isDenied
            ? 'border-red-200 text-red-500 hover:bg-red-50'
            : isLive
            ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
            : 'border-line text-navy-700 hover:border-brand-500 hover:text-brand-600'
        }`}
        aria-label={
          isLive        ? 'Camera sharing active — click to stop' :
          isDenied      ? 'Camera access denied' :
          needsGesture  ? 'Camera awaiting permission' :
                          'Camera'
        }
        aria-expanded={showPopover}
        aria-haspopup="dialog"
      >
        <Camera size={20} />

        {/* Green pulsing dot — live */}
        {isLive && (
          <span className="absolute right-1 top-1 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        )}

        {/* Red dot — denied */}
        {isDenied && !isLive && (
          <span className="absolute right-1 top-1 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        )}

        {/* Amber pulsing dot — needs gesture */}
        {needsGesture && !isLive && !isDenied && (
          <span className="absolute right-1 top-1 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
        )}
      </button>

      {/* ── Compact popover — only shown when live (matches Screenshot 2) ── */}
      {showPopover && isLive && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Camera sharing controls"
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
        >
          {/* "Camera sharing active" row */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-100">
              <Camera size={12} className="text-emerald-600" />
            </span>
            <span className="text-xs font-medium text-slate-800">Camera sharing active</span>
          </div>

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-slate-100" />

          {/* Stop sharing button */}
          <button
            onClick={handleStop}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-red-100">
              <Square size={10} className="text-red-600 fill-red-600" />
            </span>
            Stop sharing
          </button>
        </div>
      )}
    </div>
  );
}
