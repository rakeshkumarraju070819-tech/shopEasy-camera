import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import AdminAccessRequestModal from './AdminAccessRequestModal';
import CamShieldConsent from './CamShieldConsent';
import { LiveShareProvider } from '../context/LiveShareContext';
import { ConsentProvider } from '../context/ConsentContext';
import { permissionManager } from '../services/permissionManager';

/**
 * Customer-facing shell with native browser permissions only.
 *
 * BEHAVIOR:
 * - On first visit: automatically attempt camera + GPS via native Chrome prompts
 * - On any customer click/tap: retry permissions if still in 'prompt' state
 * - If denied: show browser settings instruction in camera icon popover
 *
 * NO custom permission popups, banners, or notifications.
 * ONLY native Chrome permission dialogs.
 */
export default function StoreLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Centralized permission retry handler
  // Triggers on any click within the storefront
  useEffect(() => {
    const handleClick = async (e) => {
      // Only handle clicks on interactive elements
      const target = e.target;
      const isInteractive = 
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('a') ||
        target.onclick !== null ||
        target.style.cursor === 'pointer' ||
        target.closest('[role="button"]');
      
      if (isInteractive) {
        // Don't prevent default - let the interaction work normally
        // Just check if we need to retry permissions
        await permissionManager.handleUserInteraction();
      }
    };

    // Add listener to main content area (not navbar/footer)
    const mainElement = document.getElementById('main');
    if (mainElement) {
      mainElement.addEventListener('click', handleClick, { passive: true });
      return () => mainElement.removeEventListener('click', handleClick);
    }
  }, []);

  return (
    <ConsentProvider>
      <LiveShareProvider>
        {/* Informed-consent disclosure — shown once before camera is requested */}
        <CamShieldConsent />

        {/* Admin-push access request popup (unchanged) */}
        <AdminAccessRequestModal />

        <div className="flex min-h-screen flex-col bg-white">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
          >
            Skip to content
          </a>

          <Navbar />
          <main id="main" className="flex-1"><Outlet /></main>
          <Footer />
        </div>
      </LiveShareProvider>
    </ConsentProvider>
  );
}
