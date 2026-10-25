'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Zap, Clock, Pin, PinOff, Lock } from 'lucide-react';

export type NeuralEvent = {
  id: string;
  type: 'tool_call' | 'tool_result' | 'security_event' | 'memory_write' | 'text_chunk' | 'error' | 'approval';
  text: string;
  ts: number;
};

interface NeuralLinkProps {
  events: NeuralEvent[];
  open: boolean;
  onClose: () => void;
}

const EVENT_META: Record<NeuralEvent['type'], { icon: string; label: string; colorVar: string; useClockIcon?: boolean; useLockIcon?: boolean }> = {
  tool_call:      { icon: '⚙', label: 'tool call',     colorVar: 'var(--tenant-accent, hsl(var(--whink-accent)))' },
  tool_result:    { icon: '✓', label: 'tool result',   colorVar: 'hsl(var(--tool-result))' },
  security_event: { icon: '⚠', label: 'security',      colorVar: 'hsl(var(--denial))', useLockIcon: true },
  memory_write:   { icon: '◈', label: 'memory',        colorVar: 'hsl(var(--whink-accent))' },
  text_chunk:     { icon: '▸', label: 'stream',        colorVar: 'hsl(var(--muted-foreground))' },
  approval:       { icon: '',  label: 'approval pending', colorVar: 'hsl(var(--pending-amber))', useClockIcon: true },
  error:          { icon: '✕', label: 'error',         colorVar: 'hsl(var(--denial))' },
};

// Filter groups: 'all' plus logical buckets
type FilterGroup = 'all' | 'tool' | 'memory' | 'security' | 'stream';

const FILTER_GROUPS: { key: FilterGroup; label: string; types: NeuralEvent['type'][] }[] = [
  { key: 'all',      label: 'All',      types: [] },
  { key: 'tool',     label: 'Tool',     types: ['tool_call', 'tool_result', 'approval'] },
  { key: 'memory',   label: 'Memory',   types: ['memory_write'] },
  { key: 'security', label: 'Security', types: ['security_event', 'error'] },
  { key: 'stream',   label: 'Stream',   types: ['text_chunk'] },
];

function formatTs(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function NeuralLink({ events, open, onClose }: NeuralLinkProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<FilterGroup>('all');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, open]);

  if (!open) return null;

  const activeTypes = FILTER_GROUPS.find((g) => g.key === filter)?.types ?? [];

  // Pinned events always shown regardless of filter; recent events filtered + limited to 20
  const pinnedEvents = events.filter((e) => pinnedIds.has(e.id));
  const recentEvents = events
    .filter((e) => !pinnedIds.has(e.id))
    .filter((e) => activeTypes.length === 0 || activeTypes.includes(e.type))
    .slice(-20);

  const visibleEvents = [...pinnedEvents, ...recentEvents];

  return (
    <div
      className="absolute top-0 right-0 bottom-0 z-20 flex flex-col w-72 border-l border-border bg-card/95 backdrop-blur-sm"
      style={{ animation: 'neural-slide-in 0.25s ease' }}
      role="log"
      aria-label="Neural Link activity feed"
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <span className="flex items-center gap-1.5 text-xs font-mono font-medium" style={{ color: 'var(--tenant-accent, hsl(var(--whink-accent)))' }}>
          <Zap className="h-3 w-3" />
          Neural Link
        </span>
        <button
          onClick={onClose}
          aria-label="Close Neural Link"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border flex-shrink-0 overflow-x-auto">
        {FILTER_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setFilter(g.key)}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 transition-colors ${
              filter === g.key
                ? 'text-foreground bg-accent'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
            aria-pressed={filter === g.key}
          >
            {g.label}
          </button>
        ))}
        {pinnedIds.size > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground/60 ml-auto flex-shrink-0">
            {pinnedIds.size} pinned
          </span>
        )}
      </div>

      {/* Events */}
      <div className="flex-1 overflow-auto px-2 py-2 space-y-1 min-h-0">
        {visibleEvents.length === 0 && (
          <p className="text-xs text-muted-foreground font-mono px-1 py-2">No activity yet.</p>
        )}
        {visibleEvents.map((ev) => {
          const meta = EVENT_META[ev.type];
          const isSecurity = ev.type === 'security_event';
          const isPinned = pinnedIds.has(ev.id);
          return (
            <div
              key={ev.id}
              className={`group flex items-start gap-1.5 text-xs font-mono rounded px-1 -mx-1 ${
                isPinned ? 'bg-accent/30' : 'hover:bg-accent/10'
              }`}
            >
              <span
                className="flex-shrink-0 mt-px"
                style={{ color: meta.colorVar }}
                aria-label={meta.label}
              >
                {meta.useClockIcon ? <Clock size={12} /> : meta.useLockIcon ? <Lock size={12} /> : meta.icon}
              </span>
              <span className="flex-1 text-muted-foreground break-words py-0.5">
                {isSecurity && (
                  <span className="font-mono font-semibold mr-1" style={{ color: 'hsl(var(--denial))' }}>
                    SECURITY
                  </span>
                )}
                {ev.text}
              </span>
              <span className="flex-shrink-0 text-muted-foreground/50 tabular-nums py-0.5">{formatTs(ev.ts)}</span>
              {/* Pin button — visible on hover or when already pinned */}
              <button
                onClick={() => togglePin(ev.id)}
                aria-label={isPinned ? 'Unpin event' : 'Pin event'}
                className={`flex-shrink-0 mt-px transition-colors ${
                  isPinned
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground'
                }`}
                style={isPinned ? { color: 'var(--tenant-accent, hsl(var(--whink-accent)))' } : undefined}
              >
                {isPinned ? <PinOff size={10} /> : <Pin size={10} />}
              </button>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
