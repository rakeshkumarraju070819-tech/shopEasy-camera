const tone = {
  blue: 'bg-signal-blue/15 text-signal-blue ring-signal-blue/30',
  green: 'bg-signal-green/15 text-signal-green ring-signal-green/30',
  red: 'bg-signal-red/15 text-signal-red ring-signal-red/30',
  amber: 'bg-signal-amber/15 text-signal-amber ring-signal-amber/30',
  gray: 'bg-ops-600/60 text-ops-muted ring-ops-600'
};

export function Badge({ color = 'gray', children, dot = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone[color]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const CONSENT = { accepted: ['blue', 'Accepted'], declined: ['gray', 'Declined'], pending: ['amber', 'Pending'] };
const PERMISSION = { granted: ['green', 'Granted'], denied: ['red', 'Denied'], error: ['amber', 'Camera error'], unsupported: ['gray', 'Unsupported'], not_requested: ['gray', 'Not requested'] };

export const ConsentBadge = ({ value }) => { const [c, l] = CONSENT[value] || ['gray', value || '–']; return <Badge color={c}>{l}</Badge>; };
export const PermissionBadge = ({ value }) => { const [c, l] = PERMISSION[value] || ['gray', value || '–']; return <Badge color={c}>{l}</Badge>; };
export const StatusBadge = ({ value }) => <Badge color={value === 'active' ? 'green' : 'gray'} dot>{value === 'active' ? 'Active' : 'Ended'}</Badge>;
export const SimBadge = ({ label = 'Simulated' }) => <Badge color="amber">{label}</Badge>;

export const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '–');
export const shortId = (id) => (id ? id.slice(0, 8) : '–');
