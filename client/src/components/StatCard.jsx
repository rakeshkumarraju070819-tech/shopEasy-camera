export default function StatCard({ icon: Icon, label, value, tone = 'text-signal-blue', hint }) {
  return (
    <div className="rounded-xl border border-ops-600 bg-ops-800 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ops-muted">{label}</span>
        <Icon size={18} className={tone} aria-hidden="true" />
      </div>
      <div className="mt-3 font-opsmono text-3xl font-medium text-ops-text">{value ?? '–'}</div>
      {hint && <p className="mt-1 text-xs text-ops-muted">{hint}</p>}
    </div>
  );
}

export const Panel = ({ title, action, children, className = '' }) => (
  <section className={`rounded-xl border border-ops-600 bg-ops-800 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 border-b border-ops-600 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ops-text">{title}</h2>{action}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold text-ops-text">{title}</h1>
      {subtitle && <p className="mt-1 max-w-2xl text-sm text-ops-muted">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const ErrorNote = ({ message, onRetry }) => (
  <div role="alert" className="rounded-lg border border-signal-red/40 bg-signal-red/10 p-4 text-sm text-signal-red">
    {message} {onRetry && <button onClick={onRetry} className="ml-2 font-semibold underline">Retry</button>}
  </div>
);

export const Loading = ({ label = 'Loading…' }) => <p className="py-10 text-center text-sm text-ops-muted" role="status">{label}</p>;
