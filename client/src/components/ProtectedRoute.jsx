import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Admin pages are only reachable with a signed-in administrator; everyone else is sent to the login page. */
export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
