import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FileCheck2, Globe2, LayoutDashboard, LogOut, Menu, Settings, ShieldAlert, ShieldCheck, Users, Video, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLiveSessionCount } from '../hooks/useLiveSessionCount';

const nav = [
  { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/live-sessions', label: 'Live Sessions', icon: Video, badge: true },
  { to: '/admin/visitors', label: 'Visitor Sessions', icon: Users },
  { to: '/admin/ip-intelligence', label: 'IP Intelligence', icon: Globe2 },
  { to: '/admin/consent', label: 'Consent Records', icon: FileCheck2 },
  { to: '/admin/events', label: 'Security Events', icon: ShieldAlert },
  { to: '/admin/settings', label: 'Settings', icon: Settings }
];

export default function AdminLayout() {
  const { email, logout } = useAuth();
  const liveCount = useLiveSessionCount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const signOut = () => { logout(); navigate('/admin/login', { replace: true }); };
  const item = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-signal-blue/15 text-signal-blue' : 'text-ops-muted hover:bg-ops-700 hover:text-ops-text'}`;

  return (
    <div className="ops min-h-screen bg-ops-900 font-ops text-ops-text lg:flex">
      <header className="flex items-center justify-between border-b border-ops-600 bg-ops-950 px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 font-semibold"><ShieldCheck className="text-signal-red" size={20} /> CamShield Console</span>
        <button onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} className="rounded-lg p-2 hover:bg-ops-700">{open ? <X size={20} /> : <Menu size={20} />}</button>
      </header>

      <aside className={`${open ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-r border-ops-600 bg-ops-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64`}>
        <div className="hidden items-center gap-3 px-5 py-5 lg:flex">
          <span className="grid size-9 place-items-center rounded-lg bg-signal-red/15 text-signal-red"><ShieldCheck size={20} /></span>
          <div><div className="font-semibold leading-tight">CamShield</div><div className="text-xs text-ops-muted">Security console</div></div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-3" aria-label="Admin">
          {nav.map(({ to, label, icon: Icon, badge }) => (
            <NavLink key={to} to={to} className={item} onClick={() => setOpen(false)}>
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {badge && liveCount > 0 && (
                <span className="grid min-w-5 place-items-center rounded-full bg-green-500 px-1 text-[11px] font-bold text-white">
                  {liveCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ops-600 p-3">
          <p className="truncate px-3 pb-2 text-xs text-ops-muted" title={email}>{email}</p>
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ops-muted hover:bg-signal-red/10 hover:text-signal-red"><LogOut size={18} /> Logout</button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><Outlet /></main>
    </div>
  );
}
