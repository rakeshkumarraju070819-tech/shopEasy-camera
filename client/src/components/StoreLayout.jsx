import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import CameraShareBar from './CameraShareBar';
import AdminAccessRequestModal from './AdminAccessRequestModal';
import { LiveShareProvider } from '../context/LiveShareContext';
import { ConsentProvider } from '../context/ConsentContext';

/**
 * Customer-facing shell.
 *
 * Camera/GPS controls live in a fixed bottom-left strip (CameraShareBar).
 * The strip renders null when there is nothing to show (idle, stopped) so
 * it never permanently occupies space in the navbar.
 * No custom permission popups exist. All browser prompts are native.
 */
export default function StoreLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <ConsentProvider>
      <LiveShareProvider>
        {/* Admin-push access request popup (unchanged) */}
        <AdminAccessRequestModal />

        {/*
          Camera/GPS sharing bar — fixed bottom-left, only visible when
          there is a status or action to show (auto-hides when idle/stopped).
        */}
        <div className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)]">
          <CameraShareBar />
        </div>

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
