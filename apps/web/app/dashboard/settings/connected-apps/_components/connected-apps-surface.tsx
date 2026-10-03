'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Link2, ShieldCheck, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import {
  PLATFORM_LABELS, PLATFORM_NOTES, SOCIAL_PLATFORMS, parseConnections, statusLabel,
  connectButtonLabel, interpretConnectResponse, errorMessage,
  type SocialConnectionView, type SocialPlatform, type CallbackNotice,
} from '@/lib/social-ui';

type LoadState = 'loading' | 'ready' | 'error';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function ConnectedAppsSurface({ initialNotice }: { initialNotice: CallbackNotice }) {
  const config = useTenantConfig();
  const productName = config.loading ? 'Your assistant' : config.productName;
  const [state, setState] = useState<LoadState>('loading');
  const [rows, setRows] = useState<SocialConnectionView[]>([]);
  const [notice, setNotice] = useState<CallbackNotice>(initialNotice);
  const [busy, setBusy] = useState<SocialPlatform | null>(null);
  const [confirming, setConfirming] = useState<SocialPlatform | null>(null);

  const load = useCallback(() => {
    return fetch('/api/social/connections')
      .then((r) => {
        if (!r.ok) throw new Error('load_failed');
        return r.json() as Promise<unknown>;
      })
      .then((body) => {
        setRows(parseConnections(body));
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connect = (platform: SocialPlatform) => {
    setBusy(platform);
    setNotice(null);
    fetch(`/api/social/${platform}/connect`, { method: 'POST' })
      .then(async (r) => {
        const body: unknown = await r.json().catch(() => null);
        const outcome = interpretConnectResponse(platform, r.status, body);
        if (outcome.ok) {
          window.location.assign(outcome.url);
        } else {
          setNotice({ kind: 'error', text: outcome.message });
          setBusy(null);
        }
      })
      .catch(() => {
        setNotice({ kind: 'error', text: errorMessage('server_error') });
        setBusy(null);
      });
  };

  const disconnect = (platform: SocialPlatform) => {
    setBusy(platform);
    setNotice(null);
    fetch(`/api/social/${platform}/connection`, { method: 'DELETE' })
      .then((r) => {
        if (!r.ok) throw new Error('disconnect_failed');
        setConfirming(null);
        setNotice({ kind: 'connected', text: `${PLATFORM_LABELS[platform]} disconnected.` });
        return load();
      })
      .catch(() => setNotice({ kind: 'error', text: errorMessage('server_error') }))
      .then(() => setBusy(null));
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-3 w-3" /> Settings
        </Link>
        <h1 className="text-2xl font-display font-bold tracking-tight">Connected apps</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Link accounts so {productName} can work in them for you.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-card border border-border rounded-lg p-4 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-foreground" />
        <p>Posting, replying, DMs, follows and deletes always ask for your approval first. Reading does not.</p>
      </div>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
            notice.kind === 'error'
              ? 'border-destructive text-destructive'
              : 'border-border text-foreground bg-card'
          }`}
        >
          {notice.kind === 'error' ? (
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <span>{notice.kind === 'error' ? `Error: ${notice.text}` : notice.text}</span>
        </div>
      )}

      {state === 'loading' && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading connected apps">
          {SOCIAL_PLATFORMS.map((p) => (
            <div key={p} className="h-24 bg-card animate-pulse rounded-lg border border-border" />
          ))}
        </div>
      )}

      {state === 'error' && (
        <div role="alert" className="bg-card border border-destructive rounded-lg p-5 space-y-3">
          <p className="text-sm text-destructive">Error: could not load your connected apps.</p>
          <button
            onClick={() => {
              setState('loading');
              load();
            }}
            className="px-3 py-1.5 bg-secondary text-foreground rounded-md text-sm font-medium hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && (
        <ul className="space-y-3">
          {rows.map((row) => {
            const date = formatDate(row.connectedAt);
            const isBusy = busy === row.platform;
            const connected = row.status !== 'not_connected';
            return (
              <li key={row.platform} className="bg-card border border-border rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <h2 className="text-sm font-medium flex items-center gap-2">
                      <Link2 className="h-4 w-4" /> {PLATFORM_LABELS[row.platform]}
                    </h2>
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${
                        row.status === 'expired'
                          ? 'border-destructive text-destructive'
                          : row.status === 'connected'
                            ? 'border-primary text-primary'
                            : 'border-border text-muted-foreground'
                      }`}
                    >
                      {statusLabel(row.status, row.handle)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.status !== 'connected' && (
                      <button
                        onClick={() => connect(row.platform)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {connectButtonLabel(row.status)}
                      </button>
                    )}
                    {connected && confirming !== row.platform && (
                      <button
                        onClick={() => setConfirming(row.platform)}
                        disabled={busy !== null}
                        className="px-4 py-2 bg-secondary text-foreground rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>

                {connected && confirming === row.platform && (
                  <div role="alertdialog" aria-label={`Confirm disconnect ${PLATFORM_LABELS[row.platform]}`} className="flex items-center justify-between gap-3 flex-wrap border border-destructive rounded-md p-3">
                    <p className="text-sm">
                      Disconnect {PLATFORM_LABELS[row.platform]}? Stored access is deleted and this is logged.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => disconnect(row.platform)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Confirm disconnect
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        disabled={busy !== null}
                        className="px-3 py-1.5 bg-secondary text-foreground rounded-md text-sm font-medium hover:opacity-80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {connected && (
                  <dl className="text-xs space-y-1">
                    {date && (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">Connected</dt>
                        <dd className="font-mono">{date}</dd>
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <dt className="text-muted-foreground">Scopes</dt>
                      <dd className="font-mono break-all">
                        {row.scopes.length > 0 ? row.scopes.join(' ') : 'none recorded'}
                      </dd>
                    </div>
                  </dl>
                )}

                {PLATFORM_NOTES[row.platform].map((n) => (
                  <p key={n} className="text-xs text-muted-foreground">{n}</p>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
