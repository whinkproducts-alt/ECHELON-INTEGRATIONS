'use client';

import { useState, useEffect } from 'react';
import { Brain, Search, Database, GitBranch, Lightbulb } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';

type Tab = 'semantic' | 'episodic' | 'entities' | 'hypotheses';

export function MemorySurface() {
  const [tab, setTab] = useState<Tab>('semantic');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
    search(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'semantic', label: 'Semantic', icon: <Database className="h-3.5 w-3.5" /> },
    { id: 'episodic', label: 'Episodic', icon: <Brain className="h-3.5 w-3.5" /> },
    { id: 'entities', label: 'Entities', icon: <GitBranch className="h-3.5 w-3.5" /> },
    { id: 'hypotheses', label: 'Hypotheses', icon: <Lightbulb className="h-3.5 w-3.5" /> },
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
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  m.epistemicStatus === 'KNOWN' ? 'bg-primary/10 text-primary' :
                  m.epistemicStatus === 'HYPOTHESIS' ? 'bg-amber-400/10 text-amber-400' :
                  'bg-secondary text-muted-foreground'
                }`}>{m.epistemicStatus}</span>
                <span className="text-xs text-muted-foreground font-mono">conf: {m.confidence}</span>
              </div>
              <p className="text-sm text-foreground">{m.statement}</p>
              <p className="text-xs text-muted-foreground mt-1">Source: {m.sourceType} • <SafeDate date={m.createdAt} options={{ dateStyle: 'medium' }} /></p>
            </div>
          ))}

          {tab === 'episodic' && (results?.episodes ?? []).map((m: any) => (
            <div key={m.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-blue-400/10 text-blue-400 px-1.5 py-0.5 rounded font-mono">{m.eventType}</span>
                <span className="text-xs text-muted-foreground font-mono">importance: {m.importance}</span>
              </div>
              <p className="text-sm text-foreground">{m.summary}</p>
              <p className="text-xs text-muted-foreground mt-1"><SafeDate date={m.createdAt} options={{ dateStyle: 'medium' }} /></p>
            </div>
          ))}

          {tab === 'entities' && (entities ?? []).map((e: any) => (
            <div key={e.id} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-purple-400/10 text-purple-400 px-1.5 py-0.5 rounded font-mono">{e.type}</span>
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
            <div key={h.id} className="bg-card rounded-lg border border-amber-400/20 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs bg-amber-400/10 text-amber-400 px-1.5 py-0.5 rounded font-mono">HYPOTHESIS</span>
                <span className="text-xs text-muted-foreground font-mono">conf: {h.confidence}</span>
                {h.mambaMode && <span className="text-xs text-muted-foreground font-mono">MAMBA {h.mambaMode}</span>}
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
