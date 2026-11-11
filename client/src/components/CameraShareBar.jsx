import { useState, useRef, useEffect } from 'react';
import { Camera, Video, MapPin, StopCircle, X, AlertCircle, Settings } from 'lucide-react';
import { useLiveShare } from '../context/LiveShareContext';
import { permissionManager } from '../services/permissionManager';

/**
 * CameraShareBar — minimal camera icon with status indicator.
 *
 * UI Design:
 * - Small camera icon beside cart in navbar
 * - Green dot when camera is active
 * - Red indicator when camera is denied
 * - Clicking opens popover with status and controls
 */
export default function CameraShareBar() {
  const {
    cameraState,
    cameraError,
    gpsState,
    shareState,
    isLive,
    isGpsLive,
    stopSharing,
    requestCamera,
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

  // Show icon when: active, starting, denied, or needs gesture
  const shouldShow = 
    isLive || 
    shareState === 'starting' ||
    cameraState === 'denied' ||
    cameraState === 'needs_gesture' ||
    cameraState === 'requesting';

  if (!shouldShow) {
    return null;
  }

  const isDenied = cameraState === 'denied';
  const needsGesture = cameraState === 'needs_gesture';

  const handleStopSharing = () => {
    stopSharing();
    setShowPopover(false);
  };

  const handleAllowCamera = async () => {
    await requestCamera();
  };

  return (
    <div className="relative">
      {/* Camera Icon Button */}
      <button
        ref={buttonRef}
        onClick={() => setShowPopover(!showPopover)}
        className={`relative rounded-full border p-2.5 transition-colors ${
          isDenied 
            ? 'border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50'
            : 'border-line text-navy-700 hover:border-brand-500 hover:text-brand-600'
        }`}
        aria-label={
          isLive ? "Camera sharing active - click for controls" : 
          isDenied ? "Camera access denied - click for help" :
          needsGesture ? "Click to allow camera" :
          "Camera sharing starting"
        }
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

        {/* Red denied indicator */}
        {isDenied && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        )}

        {/* Amber needs gesture indicator */}
        {needsGesture && (
          <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
        )}
      </button>

      {/* Popover - Active State */}
      {showPopover && isLive && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-line bg-white shadow-xl z-50"
          role="dialog"
          aria-label="Camera sharing controls"
        >
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

          <div className="px-4 py-3 space-y-3">
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

      {/* Popover - Denied State */}
      {showPopover && isDenied && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-red-200 bg-white shadow-xl z-50"
          role="dialog"
          aria-label="Camera permission help"
        >
          <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-3">
            <h3 className="text-sm font-bold text-red-900">Camera Access Denied</h3>
            <button
              onClick={() => setShowPopover(false)}
              className="rounded-lg p-1 text-red-400 hover:bg-red-100 hover:text-red-600"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-3">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-700 mb-2">
                  Camera permission was denied. To enable CamShield features:
                </p>
                <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
                  <li>Click the <Settings size={12} className="inline mx-0.5" /> lock icon in your browser address bar</li>
                  <li>Select "Site settings"</li>
                  <li>Find "Camera" and select "Allow"</li>
                  <li>Refresh the page</li>
                </ol>
              </div>
            </div>
            
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
              💡 You can continue shopping without camera access
            </div>
          </div>
        </div>
      )}

      {/* Popover - Needs Gesture State */}
      {showPopover && needsGesture && !isLive && !isDenied && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-line bg-white shadow-xl z-50"
          role="dialog"
          aria-label="Allow camera"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-bold text-navy-900">Allow Camera</h3>
            <button
              onClick={() => setShowPopover(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-3">
            <p className="text-sm text-gray-700 mb-4">
              Click the button below to enable camera sharing for CamShield security demonstrations.
            </p>

            <button
              onClick={handleAllowCamera}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Camera size={16} />
              Allow Camera
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
