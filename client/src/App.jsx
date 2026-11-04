import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import StoreLayout from './components/StoreLayout';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Store from './pages/Store';
import ProductDetails from './pages/ProductDetails';
import Cart from './pages/Cart';

// Admin code is split into its own chunks: customers never download it.
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminLiveSessions = lazy(() => import('./pages/AdminLiveSessions'));
const VisitorSessions = lazy(() => import('./pages/VisitorSessions'));
const VisitorDetails = lazy(() => import('./pages/VisitorDetails'));
const section = (name) => lazy(() => import('./pages/AdminSections').then((m) => ({ default: m[name] })));
const IPIntelligence = section('IPIntelligence');
const ConsentRecords = section('ConsentRecords');
const SecurityEvents = section('SecurityEvents');
const SettingsPage = section('SettingsPage');

export default function App() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-sm text-slate-500" role="status">Loading…</p>}>
      <Routes>
        {/* Admin – separate, authenticated */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/live-sessions" element={<AdminLiveSessions />} />
            <Route path="/admin/visitors" element={<VisitorSessions />} />
            <Route path="/admin/visitors/:id" element={<VisitorDetails />} />
            <Route path="/admin/ip-intelligence" element={<IPIntelligence />} />
            <Route path="/admin/consent" element={<ConsentRecords />} />
            <Route path="/admin/events" element={<SecurityEvents />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/*" element={<Navigate to="/admin/dashboard" replace />} />

        {/* Customer storefront – no admin links, no visitor data */}
        <Route element={<StoreLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/store" element={<Store />} />
          <Route path="/product/:id" element={<ProductDetails />} />
          <Route path="/cart" element={<Cart />} />
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-xl px-4 py-24 text-center">
                <h1 className="text-3xl font-extrabold">Page not found</h1>
                <p className="mt-2 text-navy-500">The page you're looking for doesn't exist.</p>
                <a href="/" className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white">
                  Back to the store
                </a>
              </div>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
