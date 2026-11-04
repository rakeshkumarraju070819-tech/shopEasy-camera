import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { ErrorNote, Loading, PageHeader, Panel } from '../components/StatCard';
import { Badge, ConsentBadge, PermissionBadge, SimBadge, StatusBadge, fmtDate } from '../components/Badges';
import LocationMap from '../components/LocationMap';
import useFetch from '../hooks/useFetch';
import { deleteVisitor, getVisitor } from '../services/adminService';
import { errMsg } from '../services/api';
import { useState } from 'react';

const Row = ({ label, children, mono }) => (
  <div className="flex justify-between gap-4 border-b border-ops-600/60 py-2.5 text-sm last:border-0">
    <dt className="text-ops-muted">{label}</dt>
    <dd className={`text-right ${mono ? 'break-all font-opsmono' : ''}`}>{children || '–'}</dd>
  </div>
);

export default function VisitorDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: v, error, loading, reload } = useFetch(() => getVisitor(id), [id]);
  const [actionError, setActionError] = useState('');

  const remove = async () => {
    if (!window.confirm('Delete this visitor record permanently?')) return;
    try { await deleteVisitor(id); navigate('/admin/visitors', { replace: true }); }
    catch (err) { setActionError(errMsg(err, 'Could not delete the record.')); }
  };

  const back = <Link to="/admin/visitors" className="mb-4 inline-flex items-center gap-2 text-sm text-ops-muted hover:text-ops-text"><ArrowLeft size={16} /> Visitor sessions</Link>;
  if (loading && !v) return <>{back}<Loading /></>;
  if (error) return <>{back}<ErrorNote message={error.includes('not found') ? 'This visitor session no longer exists. It may have been deleted by the retention policy.' : error} onRetry={reload} /></>;

  const camNow = v.cameraActive && v.sessionStatus === 'active';
  const location = [v.city, v.region, v.country].filter(Boolean).join(', ');

  return (
    <>
      {back}
      <PageHeader title="Visitor session" subtitle={v.visitorId}
        action={<div className="flex items-center gap-2">{v.isSimulated && <SimBadge label="Simulated sample record" />}<button onClick={remove} className="inline-flex items-center gap-2 rounded-lg border border-signal-red/40 px-3 py-2 text-sm text-signal-red hover:bg-signal-red/10"><Trash2 size={15} /> Delete record</button></div>} />
      {actionError && <ErrorNote message={actionError} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Consent (customer’s choice)">
          <div className="flex items-center gap-3"><ConsentBadge value={v.consentDecision} /><span className="text-xs text-ops-muted">{fmtDate(v.consentAt)}</span></div>
          <p className="mt-3 text-xs leading-relaxed text-ops-muted">Whether the visitor agreed in our notification. Agreeing does not turn the camera on.</p>
        </Panel>
        <Panel title="Browser permission (reported by browser)">
          <PermissionBadge value={v.cameraPermission} />
          <p className="mt-3 text-xs leading-relaxed text-ops-muted">What the browser answered when the camera permission prompt was shown.</p>
        </Panel>
        <Panel title="Camera right now">
          <Badge color={camNow ? 'red' : 'gray'} dot>{camNow ? 'Preview is open' : 'Not active'}</Badge>
          <p className="mt-3 text-xs leading-relaxed text-ops-muted">Permission granted is not the same as active. No camera footage is captured, stored or viewable here.</p>
        </Panel>

        <Panel title="IP intelligence" className="lg:col-span-1">
          <dl>
            <Row label="Public IP" mono>{v.ip} {v.ipSource === 'simulated' && <SimBadge />}</Row>
            <Row label="Estimated location">{location}</Row>
            <Row label="Country">{v.country}</Row>
            <Row label="City">{v.city}</Row>
            <Row label="ISP">{v.isp}</Row>
            <Row label="ASN" mono>{v.asn}</Row>
            <Row label="Data source">{v.ipSource}</Row>
          </dl>
        </Panel>
        <Panel title="Device & session">
          <dl>
            <Row label="Browser">{v.browser}</Row>
            <Row label="Operating system">{v.os}</Row>
            <Row label="Device type"><span className="capitalize">{v.deviceType}</span></Row>
            <Row label="Session status"><StatusBadge value={v.sessionStatus} /></Row>
            <Row label="Session started">{fmtDate(v.startedAt)}</Row>
            <Row label="Session ended">{fmtDate(v.endedAt)}</Row>
          </dl>
        </Panel>
        <Panel title="Estimated location"><LocationMap height={260} points={[{ lat: v.lat, lng: v.lng, label: location || v.ip, color: '#ef4b50' }]} /></Panel>

        <Panel title="Activity timeline" className="lg:col-span-3">
          {v.events?.length ? (
            <ol className="space-y-3">
              {[...v.events].reverse().map((e, i) => (
                <li key={i} className="flex gap-4 text-sm"><time className="w-40 shrink-0 text-ops-muted">{fmtDate(e.at)}</time><span>{e.message}</span></li>
              ))}
            </ol>
          ) : <p className="text-sm text-ops-muted">No events recorded.</p>}
        </Panel>
      </div>
    </>
  );
}
