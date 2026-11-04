import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../services/api';

export default function AdminLogin() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  if (isAuthenticated) return <Navigate to="/admin/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from?.startsWith('/admin') ? location.state.from : '/admin/dashboard', { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Sign-in failed. Please try again.'));
    } finally { setBusy(false); }
  };

  const field = 'mt-1.5 w-full rounded-lg border border-ops-600 bg-ops-900 px-3.5 py-3 text-ops-text outline-none placeholder:text-ops-muted/60 focus:border-signal-blue';

  return (
    <div className="ops grid min-h-screen bg-ops-950 font-ops text-ops-text lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-ops-600 bg-ops-900 p-12 lg:flex">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-signal-red/15 text-signal-red"><ShieldCheck size={22} /></span><span className="text-lg font-semibold">CamShield</span></div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight">Camera privacy, observed in the open.</h1>
          <p className="mt-4 max-w-md text-ops-muted">Review visitor sessions, consent choices and what each browser actually reported. No camera footage is ever collected or shown here.</p>
        </div>
        <p className="font-opsmono text-xs text-ops-muted">Authorised administrators only</p>
      </div>

      <div className="grid place-items-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <span className="mb-6 grid size-11 place-items-center rounded-xl bg-signal-blue/15 text-signal-blue lg:hidden"><Lock size={22} /></span>
          <h2 className="text-2xl font-semibold">Administrator sign in</h2>
          <p className="mt-1 text-sm text-ops-muted">Use the credentials set in the server’s environment file.</p>

          {params.get('expired') && !error && <p role="status" className="mt-5 rounded-lg border border-signal-amber/40 bg-signal-amber/10 p-3 text-sm text-signal-amber">Your session expired. Please sign in again.</p>}
          {error && <p role="alert" className="mt-5 rounded-lg border border-signal-red/40 bg-signal-red/10 p-3 text-sm text-signal-red">{error}</p>}

          <label className="mt-6 block text-sm font-medium" htmlFor="email">Email
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="admin@example.com" />
          </label>
          <label className="mt-4 block text-sm font-medium" htmlFor="password">Password
            <div className="relative">
              <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} pr-11`} />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ops-muted hover:text-ops-text">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>

          <button type="submit" disabled={busy || !email || !password} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-signal-blue px-4 py-3 font-semibold text-ops-950 hover:brightness-110 disabled:opacity-50">
            {busy && <Loader2 size={18} className="animate-spin" />} {busy ? 'Signing in…' : 'Login'}
          </button>
          <button type="button" onClick={() => setForgot((f) => !f)} className="mt-4 text-sm text-ops-muted underline-offset-2 hover:text-ops-text hover:underline">Forgot password?</button>
          {forgot && <p className="mt-3 rounded-lg bg-ops-800 p-3 text-sm text-ops-muted">Passwords are not reset online. Ask your system administrator to change <code className="font-opsmono text-ops-text">ADMIN_PASSWORD</code> in the server’s environment file and restart the API.</p>}
        </form>
      </div>
    </div>
  );
}
