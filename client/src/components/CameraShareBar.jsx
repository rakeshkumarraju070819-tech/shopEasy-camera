import { useState, useRef, useEffect } from 'react';
import { Camera, Video, MapPin, StopCircle, X } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';

/**
 * CameraShareBar — minimal camera icon with status indicator.
 *
 * UI Design:
 * - Small camera icon beside cart in navbar
 * - Green dot when camera is active
 * - Clicking opens popover with:
 *   • Camera status (active/inactive)
 *   • Location status (active/inactive)
 *   • Stop Sharing button
 * - No text pills, no inline controls
 * - Clean, minimal ShopEasy design
 */
export default function CameraShareBar() {
  const {
    cameraState,
    gpsState,
    shareState,
    isLive,
    isGpsLive,
    stopSharing,
  } = useLiveShare();

  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setShowPopover(false);
      }
    };
    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPopover]);

  // Don't show anything when not active or requesting
  if (!isLive && shareState !== 'camera_requesting' && shareState !== 'gps_requesting' && shareState !== 'starting') {
    return null;
  }

  const handleStopSharing = () => {
    stopSharing();
    setShowPopover(false);
  };

  return (
    <div className="relative">
      {/* Camera Icon Button */}
      <button
        ref={buttonRef}
        onClick={() => setShowPopover(!showPopover)}
        className="relative rounded-full border border-line p-2.5 text-navy-700 hover:border-brand-500 hover:text-brand-600 transition-colors"
        aria-label={isLive ? "Camera sharing active - click for controls" : "Camera sharing starting"}
        aria-expanded={showPopover}
      >
        <Camera size={20} />
        
        {/* Green active indicator dot */}
        {isLive && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        )}
      </button>

      {/* Popover */}
      {showPopover && isLive && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-line bg-white shadow-xl z-50"
          role="dialog"
          aria-label="Camera sharing controls"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-bold text-navy-900">Sharing Status</h3>
            <button
              onClick={() => setShowPopover(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Status Items */}
          <div className="px-4 py-3 space-y-3">
            {/* Camera Status */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                <Video size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-navy-900">Camera</div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Active
                </div>
              </div>
            </div>

            {/* Location Status */}
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isGpsLive ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                <MapPin size={18} className={isGpsLive ? 'text-emerald-600' : 'text-slate-400'} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-navy-900">Location</div>
                {isGpsLive ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Active
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Not shared</div>
                )}
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="border-t border-line px-4 py-3">
            <button
              onClick={handleStopSharing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
            >
              <StopCircle size={16} />
              Stop Sharing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
