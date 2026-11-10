import { Compass, Square, Video } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * Compact camera-sharing status indicator + stop button.
 * Height ~28–30px, font 11px, minimal padding.
 * Soft green for ON, grey/white for Stop.
 */
export default function LiveShareBanner() {
  const { isLive, gpsPermission, stopSharing } = useLiveShare();

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
