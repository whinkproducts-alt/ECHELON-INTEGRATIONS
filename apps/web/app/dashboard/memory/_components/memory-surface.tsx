'use client';

import { useState, useEffect } from 'react';
import { Brain, Search, Database, GitBranch, Lightbulb, Check, Pencil, Trash2, X } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

type Tab = 'semantic' | 'episodic' | 'entities' | 'hypotheses';

// ── Inline controls for a semantic memory row ─────────────────────────────────

interface MemoryControlsProps {
  memoryId: string;
  statement: string;
  epistemicStatus: string;
  onConfirm: (id: string) => Promise<void>;
  onCorrect: (id: string, newText: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function MemoryControls({ memoryId, statement, onConfirm, onCorrect, onDelete }: MemoryControlsProps) {
  const cfg = useTenantConfig();
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(statement);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(memoryId); } finally { setBusy(false); }
  };

  const handleSaveCorrection = async () => {
    if (!draftText.trim() || draftText === statement) { setEditing(false); return; }
    setBusy(true);
    try {
      await onCorrect(memoryId, draftText.trim());
      setEditing(false);
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    setBusy(true);
    try { await onDelete(memoryId); } finally { setBusy(false); setConfirming(false); }
  };

  return (
    <div className="flex items-start gap-2 mt-2">
      {editing ? (
        <div className="flex-1 flex flex-col gap-2">
          <textarea
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm bg-secondary border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            disabled={busy}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveCorrection}
              disabled={busy}
              className="px-3 py-1 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 font-mono"
            >
              Save
            </button>
            <button
              onClick={() => { setEditing(false); setDraftText(statement); }}
              disabled={busy}
              className="px-3 py-1 text-xs rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 font-mono"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 ml-auto">
          {/* Confirm */}
          <button
            onClick={handleConfirm}
            disabled={busy}
            title={cfg.memoryLabelConfirm}
            aria-label={cfg.memoryLabelConfirm}
            className="p-1.5 rounded text-muted-foreground transition-colors disabled:opacity-40"
            onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--whink-accent))')}
            onMouseLeave={e => (e.currentTarget.style.color = '')}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </button>

          {/* Correct */}
          <button
            onClick={() => { setEditing(true); setDraftText(statement); setConfirming(false); }}
            disabled={busy}
            title={cfg.memoryLabelCorrect}
            aria-label={cfg.memoryLabelCorrect}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>

          {/* Delete */}
          {confirming ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground font-mono">{cfg.memoryLabelDeleteConfirm}</span>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="px-2 py-1 text-xs rounded transition-colors disabled:opacity-40 font-mono"
                style={{ color: 'hsl(var(--destructive))' }}
                aria-label="Confirm delete"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                aria-label="Cancel delete"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              disabled={busy}
              title={cfg.memoryLabelDelete}
              aria-label={cfg.memoryLabelDelete}
              className="p-1.5 rounded text-muted-foreground transition-colors disabled:opacity-40"
              onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--destructive))')}
              onMouseLeave={e => (e.currentTarget.style.color = '')}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MemorySurface() {
  const cfg = useTenantConfig();
  const [tab, setTab] = useState<Tab>('semantic');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const search = async () => {
    setLoading(true);
    const res = await fetch(`/api/memory/search?q=${encodeURIComponent(query)}`).then(r => r.json()).catch(() => ({}));
    setResults(res);
    setLoading(false);
  };

  const loadEntities = async () => {
    const res = await fetch('/api/entities').then(r => r.json()).catch(() => []);
    setEntities(Array.isArray(res) ? res : []);
  };

  useEffect(() => {
    if (tab === 'entities') loadEntities(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [tab]);

  useEffect(() => {
    fetch(`/api/memory/search?q=`)
      .then(r => r.json())
      .catch(() => ({}))
      .then(res => { setResults(res); setLoading(false); });
  }, []);

  // ── Mutation handlers ───────────────────────────────────────────────────────

  const handleConfirm = async (id: string) => {
    await fetch(`/api/memory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epistemicStatus: 'KNOWN' }),
    });
    setResults((prev: any) => {
      if (!prev?.semantics) return prev;
      return {
        ...prev,
        semantics: prev.semantics.map((m: any) =>
          m.id === id ? { ...m, epistemicStatus: 'KNOWN' } : m
        ),
      };
    });
  };

  const handleCorrect = async (id: string, newStatement: string) => {
    await fetch(`/api/memory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statement: newStatement }),
    });
    setResults((prev: any) => {
      if (!prev?.semantics) return prev;
      return {
        ...prev,
        semantics: prev.semantics.map((m: any) =>
          m.id === id ? { ...m, statement: newStatement } : m
        ),
      };
    });
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    setResults((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        semantics: (prev.semantics ?? []).filter((m: any) => m.id !== id),
        episodes: (prev.episodes ?? []).filter((m: any) => m.id !== id),
        hypotheses: (prev.hypotheses ?? []).filter((m: any) => m.id !== id),
      };
    });
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'semantic', label: cfg.memoryTabSemantic, icon: <Database className="h-3.5 w-3.5" /> },
    { id: 'episodic', label: cfg.memoryTabEpisodic, icon: <Brain className="h-3.5 w-3.5" /> },
    { id: 'entities', label: cfg.memoryTabEntities, icon: <GitBranch className="h-3.5 w-3.5" /> },
    { id: 'hypotheses', label: cfg.memoryTabHypotheses, icon: <Lightbulb className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Memory</h1>
        <p className="text-sm text-muted-foreground mt-1">Browse and search across all memory classes</p>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Search memory..."
            className="w-full pl-10 pr-4 py-2.5 bg-secondary rounded-md border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button onClick={search} className="px-4 py-2.5 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90">
          Search
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-card animate-pulse rounded" />)}</div>
      ) : (
        <div className="space-y-2">
          {tab === 'semantic' && (results?.semantics ?? []).map((m: any) => (
            <div key={m.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-start gap-2 mb-1 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  m.epistemicStatus === 'KNOWN' ? 'bg-primary/10 text-primary' :
                  m.epistemicStatus === 'HYPOTHESIS' ? 'bg-muted/50 text-muted-foreground' :
                  'bg-secondary text-muted-foreground'
                }`}>{m.epistemicStatus}</span>
                <span className="text-xs text-muted-foreground font-mono">{cfg.memoryLabelConf}: {m.confidence}</span>
                {/* Auto badge (B13-A) */}
                {(m.sourceType === 'auto' || m.source === 'auto') && (
                  <span className="bg-primary/10 text-primary text-xs font-mono px-1.5 py-0.5 rounded">
                    {cfg.memoryAutoLabel}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground">{m.statement}</p>
              {/* Source conversation link (B13-B) */}
              {m.sourceId && (
                <a
                  href={`/dashboard/conversation/${m.sourceId}`}
                  className="text-xs text-muted-foreground mt-1 inline-block underline-offset-2 hover:underline hover:text-foreground"
                >
                  {cfg.viewSourceConversation}
                </a>
              )}
              <p className="text-xs text-muted-foreground mt-1">{cfg.memoryLabelSource}: {m.sourceType} • <SafeDate date={m.createdAt} options={{ dateStyle: 'medium' }} /></p>
              {/* Confirm / Correct / Delete (B13-C) */}
              <MemoryControls
                memoryId={m.id}
                statement={m.statement}
                epistemicStatus={m.epistemicStatus}
                onConfirm={handleConfirm}
                onCorrect={handleCorrect}
                onDelete={handleDelete}
              />
            </div>
          ))}

          {tab === 'episodic' && (results?.episodes ?? []).map((m: any) => (
            <div key={m.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono">{m.eventType}</span>
                <span className="text-xs text-muted-foreground font-mono">{cfg.memoryLabelImportance}: {m.importance}</span>
                {m.source === 'auto' && (
                  <span className="bg-primary/10 text-primary text-xs font-mono px-1.5 py-0.5 rounded">
                    {cfg.memoryAutoLabel}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground">{m.summary}</p>
              <p className="text-xs text-muted-foreground mt-1"><SafeDate date={m.createdAt} options={{ dateStyle: 'medium' }} /></p>
            </div>
          ))}

          {tab === 'entities' && (entities ?? []).map((e: any) => (
            <div key={e.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono">{e.type}</span>
                <span className="text-sm font-medium text-foreground">{e.canonicalName}</span>
              </div>
              {(e.aliases ?? []).length > 0 && (
                <p className="text-xs text-muted-foreground">Aliases: {(e.aliases ?? []).map((a: any) => a.alias).join(', ')}</p>
              )}
              {(e.edgesFrom ?? []).length > 0 && (
                <div className="mt-2 space-y-1">
                  {(e.edgesFrom ?? []).map((edge: any) => (
                    <p key={edge.id} className="text-xs text-muted-foreground">
                      <span className="text-foreground">{edge.relationshipType}</span> → {edge.to?.canonicalName ?? 'Unknown'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}

          {tab === 'hypotheses' && (results?.hypotheses ?? []).map((h: any) => (
            <div key={h.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded font-mono">{cfg.memoryLabelHypothesis}</span>
                <span className="text-xs text-muted-foreground font-mono">{cfg.memoryLabelConf}: {h.confidence}</span>
                {h.mambaMode && <span className="text-xs text-muted-foreground font-mono">{cfg.memoryLabelMamba} {h.mambaMode}</span>}
              </div>
              <p className="text-sm text-foreground">{h.statement}</p>
              {h.rationale && <p className="text-xs text-muted-foreground mt-1">{h.rationale}</p>}
            </div>
          ))}

          {tab !== 'entities' && !(results?.semantics?.length || results?.episodes?.length || results?.hypotheses?.length) && (
            <div className="text-center py-12">
              <Brain className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No memories found. Start conversations to build memory.</p>
            </div>
          )}
          {tab === 'entities' && entities.length === 0 && (
            <div className="text-center py-12">
              <GitBranch className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No entities yet. They will be extracted from conversations.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
