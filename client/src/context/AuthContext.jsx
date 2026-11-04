import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ADMIN_TOKEN_KEY } from '../services/api';
import * as admin from '../services/adminService';

const AuthContext = createContext(null);
const EMAIL_KEY = 'camshield.admin.email';

export function AuthProvider({ children }) {
  // Token lives in sessionStorage: it is cleared when the browser tab closes.
  const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_KEY));
  const [email, setEmail] = useState(() => sessionStorage.getItem(EMAIL_KEY));

  const login = useCallback(async (e, p) => {
    const data = await admin.login(e, p);
    sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    sessionStorage.setItem(EMAIL_KEY, data.admin.email);
    setToken(data.token);
    setEmail(data.admin.email);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
    setToken(null);
    setEmail(null);
  }, []);

  const value = useMemo(() => ({ token, email, isAuthenticated: Boolean(token), login, logout }), [token, email, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
