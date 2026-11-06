import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info } from 'lucide-react';
import { Badge, ConsentBadge, PermissionBadge, SimBadge, fmtDate, shortId } from '../components/Badges';
import LocationMap from '../components/LocationMap';
import { ErrorNote, Loading, PageHeader, Panel } from '../components/StatCard';
import useFetch from '../hooks/useFetch';
import { getEvents, getSettings, getVisitors, purgeVisitors } from '../services/adminService';
import { errMsg } from '../services/api';
import { useAuth } from '../context/AuthContext';

const Th = ({ children }) => <th className="whitespace-nowrap pb-3 pr-4 font-medium">{children}</th>;
const idLink = (v) => <Link to={`/admin/visitors/${v.visitorId}`} className="font-opsmono text-signal-blue hover:underline">{shortId(v.visitorId)}</Link>;

export function IPIntelligence() {
  const { data, error, loading, reload } = useFetch(() => getVisitors({}));
  return (
    <>
      <PageHeader title="IP Intelligence" subtitle="Location and network details estimated from each visitor’s IP address. An IP shows the network’s registered area, never a street address or home." />
      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <>
          <Panel title="Estimated locations">
            <LocationMap height={360} points={(data?.visitors || []).filter(Boolean).map((v) => ({ lat: v?.lat, lng: v?.lng, label: `${v?.city || 'Unknown'}, ${v?.country || ''} (${v?.ip || ''})`, color: v?.consentDecision === 'accepted' ? '#4b93ff' : '#ef4b50' }))} />
            <p className="mt-1 text-xs text-ops-muted">Blue: consent accepted. Red: declined or not answered.</p>
          </Panel>
          <Panel title="Lookup results" className="mt-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs text-ops-muted"><tr><Th>Visitor</Th><Th>Public IP</Th><Th>Country</Th><Th>City</Th><Th>Region</Th><Th>ISP</Th><Th>ASN</Th><Th>Source</Th></tr></thead>
                <tbody className="divide-y divide-ops-600">
                  {(data?.visitors || []).filter(Boolean).map((v, i) => (
                    <tr key={v?.visitorId || v?._id || `v-${i}`}>
                      <td className="py-3 pr-4">{idLink(v)}</td><td className="py-3 pr-4 font-opsmono">{v.ip || '–'}</td>
                      <td className="py-3 pr-4">{v.country || '–'}</td><td className="py-3 pr-4">{v.city || '–'}</td><td className="py-3 pr-4">{v.region || '–'}</td>
                      <td className="py-3 pr-4 text-ops-muted">{v.isp || '–'}</td><td className="py-3 pr-4 font-opsmono">{v.asn || '–'}</td>
                      <td className="py-3 pr-4">{v.ipSource === 'simulated' ? <SimBadge /> : <Badge color={v.ipSource === 'unavailable' ? 'red' : 'green'}>{v.ipSource === 'unavailable' ? 'Lookup failed' : v.ipSource}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.visitors.length === 0 && <p className="py-8 text-center text-sm text-ops-muted">No lookups yet.</p>}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

export function ConsentRecords() {
  const { data, error, loading, reload } = useFetch(() => getVisitors({}));
  return (
    <>
      <PageHeader title="Consent Records" subtitle="Each row shows the customer’s choice and, separately, what their browser reported." />
      <Panel>
        {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-ops-muted"><tr><Th>Visitor</Th><Th>Consent decision</Th><Th>Decided at</Th><Th>Browser permission</Th><Th>Camera now</Th></tr></thead>
              <tbody className="divide-y divide-ops-600">
                {(data?.visitors || []).filter(Boolean).map((v, i) => (
                  <tr key={v?.visitorId || v?._id || `v-${i}`}>
                    <td className="py-3 pr-4">{idLink(v)} {v.isSimulated && <SimBadge />}</td>
                    <td className="py-3 pr-4"><ConsentBadge value={v.consentDecision} /></td>
                    <td className="py-3 pr-4 text-ops-muted">{fmtDate(v.consentAt)}</td>
                    <td className="py-3 pr-4"><PermissionBadge value={v.cameraPermission} /></td>
                    <td className="py-3 pr-4">{v.cameraActive && v.sessionStatus === 'active' ? <Badge color="red" dot>Active</Badge> : <span className="text-ops-muted">Not active</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.visitors.length === 0 && <p className="py-8 text-center text-sm text-ops-muted">No consent records yet.</p>}
          </div>
        )}
      </Panel>
    </>
  );
}

export function SecurityEvents() {
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const { data, error, loading, reload } = useFetch(getEvents);
  const events = (data?.events || []).filter((e) => !onlyWarnings || e.severity === 'warning');
  return (
    <>
      <PageHeader title="Security Events" subtitle="An audit trail of consent choices, browser permission results and camera preview activity."
        action={<label className="flex items-center gap-2 text-sm text-ops-muted"><input type="checkbox" checked={onlyWarnings} onChange={(e) => setOnlyWarnings(e.target.checked)} className="accent-signal-blue" /> Warnings only</label>} />
      <Panel>
        {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <Loading /> : events.length === 0 ? <p className="py-8 text-center text-sm text-ops-muted">No events to show.</p> : (
          <ul className="divide-y divide-ops-600">
            {events.map((e, i) => (
              <li key={i} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3 text-sm">
                {e.severity === 'warning' ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-signal-amber" aria-label="Warning" /> : <Info size={18} className="mt-0.5 shrink-0 text-signal-blue" aria-label="Info" />}
                <span className="min-w-0 flex-1">{e.message}</span>
                <Link to={`/admin/visitors/${e.visitorId}`} className="font-opsmono text-signal-blue hover:underline">{shortId(e.visitorId)}</Link>
                <time className="w-40 text-right text-ops-muted">{fmtDate(e.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

export function SettingsPage() {
  const { email } = useAuth();
  const { data, error, loading, reload } = useFetch(getSettings);
  const [days, setDays] = useState(30);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const run = async (body, confirmText) => {
    if (!window.confirm(confirmText)) return;
    try { const r = await purgeVisitors(body); setMsg({ type: 'ok', text: `Deleted ${r.deleted} record${r.deleted === 1 ? '' : 's'}.` }); }
    catch (err) { setMsg({ type: 'err', text: errMsg(err, 'Could not delete records.') }); }
  };

  const Row = ({ k, v }) => <div className="flex justify-between gap-4 border-b border-ops-600/60 py-2.5 text-sm last:border-0"><dt className="text-ops-muted">{k}</dt><dd className="text-right">{v}</dd></div>;

  return (
    <>
      <PageHeader title="Settings" subtitle="Configuration summary and data retention controls." />
      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Configuration">
            <dl>
              <Row k="Signed in as" v={email} />
              <Row k="Storage" v={data.storage === 'mongodb' ? 'MongoDB' : <Badge color="amber">Temporary in-memory (resets on restart)</Badge>} />
              <Row k="IP lookup provider" v={data.ipProvider} />
              <Row k="Automatic retention" v={data.retentionDays ? `${data.retentionDays} days` : 'Off'} />
              <Row k="Sample data" v={data.sampleDataEnabled ? 'Enabled (development only)' : 'Off'} />
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-ops-muted">Change these in <code className="font-opsmono">server/.env</code> and restart the API.</p>
          </Panel>

          <Panel title="Data retention">
            {msg.text && <p role="status" className={`mb-4 rounded-lg p-3 text-sm ${msg.type === 'ok' ? 'bg-signal-green/10 text-signal-green' : 'bg-signal-red/10 text-signal-red'}`}>{msg.text}</p>}
            <label className="block text-sm" htmlFor="days">Delete sessions older than (days)</label>
            <div className="mt-2 flex gap-3">
              <input id="days" type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} className="w-28 rounded-lg border border-ops-600 bg-ops-900 px-3 py-2 text-sm outline-none focus:border-signal-blue" />
              <button onClick={() => run({ olderThanDays: Number(days) }, `Delete all sessions older than ${days} days? This cannot be undone.`)} className="rounded-lg bg-signal-red px-4 py-2 text-sm font-semibold text-white hover:brightness-110">Delete old sessions</button>
            </div>
            <div className="mt-6 border-t border-ops-600 pt-5">
              <p className="text-sm text-ops-muted">Remove the fictional sample records used for development.</p>
              <button onClick={() => run({ simulatedOnly: true }, 'Delete all simulated sample records?')} className="mt-3 rounded-lg border border-ops-600 px-4 py-2 text-sm font-medium hover:bg-ops-700">Delete sample records</button>
            </div>
          </Panel>

          <Panel title="What CamShield never does" className="lg:col-span-2">
            <ul className="grid gap-2 text-sm text-ops-muted sm:grid-cols-2">
              <li>Never starts the camera without the visitor’s consent and the browser’s permission.</li>
              <li>Never records, stores or transmits video.</li>
              <li>Never shows camera footage to administrators.</li>
              <li>Never requires camera access to shop.</li>
            </ul>
          </Panel>
        </div>
      )}
    </>
  );
}
