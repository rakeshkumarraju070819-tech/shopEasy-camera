import { Compass, Video, X } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * Small, unobtrusive camera and GPS sharing indicator.
 * Displays ONLY when live sharing is active.
 * Fits cleanly into the header or navigation without pushing the page down.
 */
export default function LiveShareBanner() {
  const { isLive, gpsPermission, stopSharing } = useLiveShare();

  if (!isLive) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 animate-fadeIn shrink-0"
    >
      {/* Small Camera Sharing Indicator */}
      <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/70 bg-emerald-50/90 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-xs">
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <Video size={13} className="text-emerald-700 shrink-0" />
        <span className="whitespace-nowrap">Camera Sharing: ON</span>
        {gpsPermission === 'granted' && (
          <span className="ml-1 flex items-center gap-0.5 text-[10px] text-emerald-700 font-medium border-l border-emerald-300/80 pl-1.5">
            <Compass size={11} className="shrink-0" /> GPS
          </span>
        )}
      </div>

      {/* Small Stop Sharing Button */}
      <button
        onClick={stopSharing}
        className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs"
        aria-label="Stop sharing camera and GPS"
      >
        <X size={12} className="text-slate-500" />
        <span className="whitespace-nowrap">Stop Sharing</span>
      </button>
    </div>
  );
}
