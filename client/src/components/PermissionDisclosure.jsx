import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';

/**
 * Non-blocking informational disclosure about CamShield
 * Shows once before first permission request
 * No buttons - purely informational
 * Can be dismissed
 */
export default function PermissionDisclosure() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has already seen the disclosure
    const hasSeenDisclosure = localStorage.getItem('camshield_disclosure_seen');
    
    if (!hasSeenDisclosure) {
      // Show disclosure after 1 second (don't block page load)
      const timer = setTimeout(() => {
        setVisible(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    localStorage.setItem('camshield_disclosure_seen', 'true');
  };

  if (!visible || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 md:left-auto md:max-w-md">
      <div className="rounded-lg border border-blue-200 bg-white p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <Info className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Privacy & Security Demo
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              ShopEasy uses CamShield technology for authorized security demonstrations. 
              Your browser may request camera and location permissions. 
              Video and location data will only be shared with authorized administrators after your explicit consent.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              You control all permissions. You can shop freely without participating.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
