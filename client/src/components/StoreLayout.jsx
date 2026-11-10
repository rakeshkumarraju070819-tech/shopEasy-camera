import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import AdminAccessRequestModal from './AdminAccessRequestModal';
import { LiveShareProvider } from '../context/LiveShareContext';
import { ConsentProvider } from '../context/ConsentContext';

/**
 * Customer-facing shell.
 *
 * Camera/GPS sharing controls are compact pills in the Navbar (CameraShareBar).
 * There are no custom permission popups, modals, or banners.
 *
 * A small static disclosure bar is shown so customers know what this site does
 * before the native browser permission prompt appears. It is purely informational
 * — it has no buttons and does not intercept browser permission flows.
 */
export default function StoreLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <ConsentProvider>
      <LiveShareProvider>
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
