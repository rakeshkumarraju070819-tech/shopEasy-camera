import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { ErrorNote, Loading, PageHeader, Panel } from '../components/StatCard';
import { ConsentBadge, PermissionBadge, SimBadge, StatusBadge, fmtDate, shortId } from '../components/Badges';
import useFetch from '../hooks/useFetch';
import { getVisitors } from '../services/adminService';
import { getSocket } from '../services/webrtc';
import { useAuth } from '../context/AuthContext';

const COLS = ['Visitor ID', 'Public IP', 'Country', 'City', 'ISP', 'Browser', 'OS', 'Device', 'Consent', 'Camera permission', 'Session', 'Visited'];
const input = 'rounded-lg border border-ops-600 bg-ops-900 px-3 py-2 text-sm text-ops-text outline-none focus:border-signal-blue';

export default function VisitorSessions() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [consent, setConsent] = useState('');
  const [status, setStatus] = useState('');
  const { data, error, loading, reload } = useFetch(() => getVisitors({ q: q || undefined, consent: consent || undefined, status: status || undefined }), [q, consent, status]);
  const socketRef = useRef(null);

  // Listen for new visitor events and reload the list
  useEffect(() => {
    if (!token) return;

    const socket = getSocket({ token });
    socketRef.current = socket;

    const handleNewVisitor = () => {
      console.log('[VisitorSessions] New visitor detected, reloading list');
      reload();
    };

    socket.on('new_visitor', handleNewVisitor);

    return () => {
      socket.off('new_visitor', handleNewVisitor);
    };
  }, [token, reload]);

  return (
    <>
      <PageHeader title="Visitor Sessions" subtitle="One row per visitor who answered the camera-demo notification. Locations are estimates from IP data." />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ops-muted" />
            <input aria-label="Search sessions" placeholder="Search ID, IP, city, browser…" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} w-full pl-9`} />
          </div>
          <select aria-label="Filter by consent" value={consent} onChange={(e) => setConsent(e.target.value)} className={input}>
            <option value="">All consent choices</option><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="pending">Pending</option>
          </select>
          <select aria-label="Filter by session status" value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
            <option value="">All sessions</option><option value="active">Active</option><option value="ended">Ended</option>
          </select>
        </div>

        {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="text-xs text-ops-muted"><tr>{COLS.map((h) => <th key={h} className="whitespace-nowrap pb-3 pr-4 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-ops-600">
                {data.visitors.map((v) => (
                  <tr key={v.visitorId} onClick={() => navigate(`/admin/visitors/${v.visitorId}`)} className="cursor-pointer hover:bg-ops-700/60">
                    <td className="whitespace-nowrap py-3 pr-4"><Link to={`/admin/visitors/${v.visitorId}`} onClick={(e) => e.stopPropagation()} className="font-opsmono text-signal-blue hover:underline">{shortId(v.visitorId)}</Link></td>
                    <td className="whitespace-nowrap py-3 pr-4 font-opsmono">{v.ip || '–'} {v.ipSource === 'simulated' && <SimBadge />}</td>
                    <td className="py-3 pr-4">{v.country || '–'}</td>
                    <td className="py-3 pr-4">{v.city || '–'}</td>
                    <td className="py-3 pr-4 text-ops-muted">{v.isp || '–'}</td>
                    <td className="py-3 pr-4">{v.browser}</td>
                    <td className="py-3 pr-4">{v.os}</td>
                    <td className="py-3 pr-4 capitalize">{v.deviceType}</td>
                    <td className="py-3 pr-4"><ConsentBadge value={v.consentDecision} /></td>
                    <td className="py-3 pr-4"><PermissionBadge value={v.cameraPermission} /></td>
                    <td className="py-3 pr-4"><StatusBadge value={v.sessionStatus} /></td>
                    <td className="whitespace-nowrap py-3 text-ops-muted">{fmtDate(v.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.visitors.length === 0 && <p className="py-10 text-center text-sm text-ops-muted">No sessions match these filters.</p>}
          </div>
        )}
      </Panel>
    </>
  );
}
