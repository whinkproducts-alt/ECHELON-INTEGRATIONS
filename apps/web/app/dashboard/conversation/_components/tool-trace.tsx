'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface ToolTraceProps {
  tool: string;
  input?: unknown;
  result?: { success: boolean; data?: unknown };
  persona: string;
}

export function ToolTrace({ tool, input, result, persona }: ToolTraceProps) {
  const [expanded, setExpanded] = useState(false);

  const status: 'running' | 'success' | 'failure' =
    result === undefined ? 'running' : result.success ? 'success' : 'failure';

  const statusColor =
    status === 'running'
      ? 'hsl(var(--whink-accent))'
      : status === 'success'
      ? 'hsl(var(--whink-accent))'
      : 'hsl(var(--denial))';

  const isMamba = persona === 'MAMBA';

  return (
    <div
      className="my-1 rounded border font-mono text-xs"
      style={{
        borderColor: isMamba
          ? 'hsl(var(--mamba-blood) / 0.35)'
          : 'hsl(var(--border))',
        background: 'hsl(var(--surface))',
      }}
    >
      {/* Collapsed row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5 transition-colors rounded"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}

        {/* Tool name badge */}
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide"
          style={{
            color: isMamba ? 'hsl(var(--mamba-blood))' : 'hsl(var(--whink-accent))',
            background: isMamba
              ? 'hsl(var(--mamba-blood) / 0.12)'
              : 'hsl(var(--whink-accent) / 0.10)',
            border: isMamba
              ? '1px solid hsl(var(--mamba-blood) / 0.4)'
              : '1px solid hsl(var(--whink-accent) / 0.3)',
          }}
        >
          {tool}
        </span>

        {/* Status indicator */}
        {status === 'running' && (
          <>
            <Loader2
              className="h-3 w-3 animate-spin flex-shrink-0"
              style={{ color: statusColor }}
            />
            <span style={{ color: statusColor }}>running</span>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2
              className="h-3 w-3 flex-shrink-0"
              style={{ color: statusColor }}
            />
            <span style={{ color: statusColor }}>done</span>
          </>
        )}
        {status === 'failure' && (
          <>
            <XCircle
              className="h-3 w-3 flex-shrink-0"
              style={{ color: statusColor }}
            />
            <span style={{ color: statusColor }}>failed</span>
          </>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {input !== undefined && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-widest">Input</p>
              <pre
                className="overflow-auto max-h-[200px] rounded p-2 text-[11px] leading-relaxed"
                style={{ background: 'hsl(var(--base))', color: 'hsl(var(--foreground))' }}
              >
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-widest">Result</p>
              <pre
                className="overflow-auto max-h-[200px] rounded p-2 text-[11px] leading-relaxed"
                style={{ background: 'hsl(var(--base))', color: 'hsl(var(--foreground))' }}
              >
                {JSON.stringify(result.data ?? result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
