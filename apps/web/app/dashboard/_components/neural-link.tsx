'use client';

import { useEffect, useRef } from 'react';
import { X, Zap, Clock } from 'lucide-react';

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

const EVENT_META: Record<NeuralEvent['type'], { icon: string; label: string; colorVar: string; useClockIcon?: boolean }> = {
  tool_call:      { icon: '⚙', label: 'tool call',     colorVar: 'var(--tenant-accent, hsl(var(--whink-accent)))' },
  tool_result:    { icon: '✓', label: 'tool result',   colorVar: 'hsl(var(--whink-green))' },
  security_event: { icon: '⚠', label: 'security',      colorVar: 'hsl(var(--denial))' },
  memory_write:   { icon: '◈', label: 'memory',        colorVar: 'hsl(var(--whink-accent))' },
  text_chunk:     { icon: '▸', label: 'stream',        colorVar: 'hsl(var(--muted-foreground))' },
  approval:       { icon: '',  label: 'approval pending', colorVar: 'hsl(var(--pending-amber))', useClockIcon: true },
  error:          { icon: '✕', label: 'error',         colorVar: 'hsl(var(--denial))' },
};

function formatTs(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function NeuralLink({ events, open, onClose }: NeuralLinkProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, open]);

  if (!open) return null;

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

      {/* Events */}
      <div className="flex-1 overflow-auto px-2 py-2 space-y-1 min-h-0">
        {events.length === 0 && (
          <p className="text-xs text-muted-foreground font-mono px-1 py-2">No activity yet.</p>
        )}
        {events.slice(-20).map((ev) => {
          const meta = EVENT_META[ev.type];
          const isSecurity = ev.type === 'security_event';
          return (
            <div key={ev.id} className="flex items-start gap-1.5 text-xs font-mono">
              <span
                className="flex-shrink-0 mt-px"
                style={{ color: meta.colorVar }}
                aria-label={meta.label}
              >
                {meta.useClockIcon ? <Clock size={12} /> : meta.icon}
              </span>
              <span className="flex-1 text-muted-foreground break-words">
                {isSecurity && (
                  <span className="font-mono font-semibold mr-1" style={{ color: 'hsl(var(--denial))' }}>
                    SECURITY
                  </span>
                )}
                {ev.text}
              </span>
              <span className="flex-shrink-0 text-muted-foreground/50 tabular-nums">{formatTs(ev.ts)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
