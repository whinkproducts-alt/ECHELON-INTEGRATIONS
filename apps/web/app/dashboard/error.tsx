'use client';

export default function DashboardError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="operations-page" role="alert">
      <h1 className="workspace-title">Page unavailable</h1>
      <p className="workspace-description">This page could not be opened. Try loading it again.</p>
      <button type="button" onClick={retry} className="workspace-button workspace-button-secondary mt-4">Try again</button>
    </div>
  );
}
