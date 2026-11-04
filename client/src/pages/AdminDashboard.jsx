import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, CheckCircle2, Users, Video, VideoOff, XCircle } from 'lucide-react';
import StatCard, { ErrorNote, Loading, PageHeader, Panel } from '../components/StatCard';
import { ConsentBadge, PermissionBadge, SimBadge, StatusBadge, fmtDate, shortId } from '../components/Badges';
import useFetch from '../hooks/useFetch';
import { getStats, getVisitors } from '../services/adminService';

const axis = { stroke: '#8c9cbb', fontSize: 12, tickLine: false, axisLine: false };
const tip = { contentStyle: { background: '#0a1222', border: '1px solid #222f49', borderRadius: 8, color: '#e6ecf8' }, cursor: { fill: 'rgba(75,147,255,.08)' } };

export default function AdminDashboard() {
  const stats = useFetch(getStats);
  const recent = useFetch(() => getVisitors({}));
  const s = stats.data;

  return (
    <>
      <PageHeader title="Overview" subtitle="Consent is the customer’s choice in our notification. Browser permission is what the browser itself reported. They are tracked separately." />
      {stats.error && <ErrorNote message={stats.error} onRetry={stats.reload} />}
      {stats.loading && !s && <Loading />}
      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard icon={Users} label="Total visitor sessions" value={s.totalSessions} hint={s.simulatedRecords ? `${s.simulatedRecords} are simulated sample records` : undefined} />
            <StatCard icon={CheckCircle2} label="Camera consent accepted" value={s.consentAccepted} tone="text-signal-blue" />
            <StatCard icon={XCircle} label="Camera consent declined" value={s.consentDeclined} tone="text-ops-muted" />
            <StatCard icon={Video} label="Browser permission granted" value={s.permissionGranted} tone="text-signal-green" />
            <StatCard icon={VideoOff} label="Browser permission denied" value={s.permissionDenied} tone="text-signal-red" />
            <StatCard icon={Activity} label="Active demo sessions" value={s.activeDemoSessions} tone="text-signal-red" hint="Preview open right now" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Panel title="Sessions, last 7 days">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={s.sessionsByDay} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4b93ff" stopOpacity={0.45} /><stop offset="100%" stopColor="#4b93ff" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="#222f49" vertical={false} />
                    <XAxis dataKey="label" {...axis} /><YAxis allowDecimals={false} {...axis} />
                    <Tooltip {...tip} />
                    <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#4b93ff" strokeWidth={2} fill="url(#sg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Consent choices by day">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.sessionsByDay} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid stroke="#222f49" vertical={false} />
                    <XAxis dataKey="label" {...axis} /><YAxis allowDecimals={false} {...axis} />
                    <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12, color: '#8c9cbb' }} />
                    <Bar dataKey="accepted" name="Accepted" fill="#4b93ff" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="declined" name="Declined" fill="#ef4b50" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </>
      )}

      <Panel title="Latest sessions" className="mt-6" action={<Link to="/admin/visitors" className="text-sm font-medium text-signal-blue hover:underline">View all</Link>}>
        {recent.error ? <ErrorNote message={recent.error} onRetry={recent.reload} /> : !recent.data ? <Loading /> : recent.data.visitors.length === 0 ? (
          <p className="py-6 text-center text-sm text-ops-muted">No visitor sessions yet. They appear here once a customer answers the camera-demo notification.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-ops-muted"><tr>{['Visitor', 'Consent', 'Permission', 'Status', 'Started'].map((h) => <th key={h} className="pb-3 pr-4 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-ops-600">
                {recent.data.visitors.slice(0, 6).map((v) => (
                  <tr key={v.visitorId}>
                    <td className="py-3 pr-4"><Link to={`/admin/visitors/${v.visitorId}`} className="font-opsmono text-signal-blue hover:underline">{shortId(v.visitorId)}</Link> {v.isSimulated && <SimBadge />}</td>
                    <td className="py-3 pr-4"><ConsentBadge value={v.consentDecision} /></td>
                    <td className="py-3 pr-4"><PermissionBadge value={v.cameraPermission} /></td>
                    <td className="py-3 pr-4"><StatusBadge value={v.sessionStatus} /></td>
                    <td className="py-3 text-ops-muted">{fmtDate(v.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
