import { Compass, Play, Square, Video, VideoOff } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * Compact camera-sharing status indicator + controls in the Navbar.
 *
 * Visible states:
 *  1. phase === 'live'            → "Camera ON" badge + Stop Sharing button
 *  2. phase === 'ready_to_resume' → "Start Sharing" button for return visitors
 *  3. phase === 'stopped'         → Muted "Sharing stopped" label
 *
 * Height ~28–30px, font 11px, minimal padding.
 */
export default function LiveShareBanner() {
  const { phase, isLive, gpsPermission, stopSharing, resumeSharing } = useLiveShare();

  // ── Return visitor: show "Start Sharing" button ──
  if (phase === 'ready_to_resume') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 animate-fadeIn shrink-0"
      >
        <button
          onClick={resumeSharing}
          className="flex items-center gap-1 rounded-lg border border-sky-400/60 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 hover:border-sky-500 transition-colors shadow-xs leading-none"
          aria-label="Start camera sharing"
        >
          <Play size={10} className="text-sky-600 shrink-0" />
          Start Sharing
        </button>
      </div>
    );
  }

  // ── Stopped state: subtle indicator ──
  if (phase === 'stopped') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-1 shrink-0"
      >
        <span className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500 leading-none">
          <VideoOff size={10} className="text-slate-400 shrink-0" />
          Sharing stopped
        </span>
      </div>
    );
  }

  // ── Live: show "Camera ON" badge + Stop button ──
  if (!isLive) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 animate-fadeIn shrink-0"
    >
      {/* Camera ON indicator */}
      <div className="flex items-center gap-1 rounded-lg border border-emerald-500/60 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 shadow-xs leading-none">
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        <Video size={11} className="text-emerald-700 shrink-0" />
        <span>Camera ON</span>
        {gpsPermission === 'granted' && (
          <span className="ml-0.5 flex items-center gap-0.5 text-[10px] text-emerald-700 border-l border-emerald-300/80 pl-1">
            <Compass size={10} className="shrink-0" />
            GPS
          </span>
        )}
      </div>

      {/* Stop Sharing button */}
      <button
        onClick={stopSharing}
        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors shadow-xs leading-none"
        aria-label="Stop sharing camera and GPS"
      >
        <Square size={10} className="text-slate-400" />
        Stop Sharing
      </button>
    </div>
  );
}
