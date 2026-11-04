import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import LiveShareConsentModal from './LiveShareConsentModal';
import AdminAccessRequestModal from './AdminAccessRequestModal';
import { LiveShareProvider } from '../context/LiveShareContext';
import { ConsentProvider } from '../context/ConsentContext';

/** Customer-facing shell. Preserves standard ShopEasy layout. */
export default function StoreLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <ConsentProvider>
      <LiveShareProvider>
        {/* Consent modal — shown on first visit only */}
        <LiveShareConsentModal />

        {/* Real-time Administrator Access Request modal */}
        <AdminAccessRequestModal />

        <div className="flex min-h-screen flex-col bg-white">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
          >
            Skip to content
          </a>

          {/* Standard ShopEasy navigation */}
          <Navbar />
          <main id="main" className="flex-1"><Outlet /></main>
          <Footer />
        </div>
      </LiveShareProvider>
    </ConsentProvider>
  );
}
