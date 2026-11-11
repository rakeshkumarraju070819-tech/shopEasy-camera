import { useEffect, useState } from 'react';
import { Bell, X, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { shortId, fmtDate } from './Badges';

/**
 * Toast notification for new visitor arrivals
 */
export default function VisitorNotification({ visitor, onDismiss }) {
  const [visible, setVisible] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-dismiss after 10 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // Wait for fade animation
    }, 10000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  const handleInspect = () => {
    navigate(`/admin/visitors/${visitor.visitorId}`);
    handleDismiss();
  };

  if (!visible) return null;

  return (
    <div className={`transform transition-all duration-300 ${visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
      <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-ops-800 shadow-lg ring-1 ring-black ring-opacity-5">
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Bell className="h-6 w-6 text-signal-blue" aria-hidden="true" />
            </div>
            <div className="ml-3 w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium text-ops-text">New Visitor Detected</p>
              <p className="mt-1 text-sm text-ops-muted">
                <span className="font-opsmono text-signal-blue">{shortId(visitor.visitorId)}</span>
              </p>
              <div className="mt-2 text-xs text-ops-muted space-y-0.5">
                <p>📍 {visitor.city ? `${visitor.city}, ${visitor.country}` : visitor.country || 'Unknown location'}</p>
                <p>💻 {visitor.browser} on {visitor.os} ({visitor.deviceType})</p>
                <p>🕐 {fmtDate(visitor.startedAt)}</p>
              </div>
              <div className="mt-3 flex space-x-2">
                <button
                  type="button"
                  onClick={handleInspect}
                  className="inline-flex items-center gap-1 rounded-md bg-signal-blue px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-signal-blue/90 focus:outline-none focus:ring-2 focus:ring-signal-blue focus:ring-offset-2 focus:ring-offset-ops-800"
                >
                  <Eye size={14} />
                  Inspect
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="inline-flex rounded-md bg-ops-700 px-3 py-1.5 text-xs font-medium text-ops-muted hover:bg-ops-600 focus:outline-none focus:ring-2 focus:ring-ops-500 focus:ring-offset-2 focus:ring-offset-ops-800"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <div className="ml-4 flex flex-shrink-0">
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex rounded-md text-ops-muted hover:text-ops-text focus:outline-none focus:ring-2 focus:ring-signal-blue focus:ring-offset-2 focus:ring-offset-ops-800"
              >
                <span className="sr-only">Close</span>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
