export default function DashboardLoading() {
  return (
    <div className="operations-page" role="status" aria-live="polite" aria-busy="true">
      <p className="workspace-description">Opening page…</p>
      <div aria-hidden="true" className="mt-6 space-y-4 motion-safe:animate-pulse">
        <div className="h-8 w-1/3 rounded bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-40 rounded bg-muted" />
      </div>
    </div>
  );
}
