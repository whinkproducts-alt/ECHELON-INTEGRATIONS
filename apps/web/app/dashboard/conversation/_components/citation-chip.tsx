'use client';

import { useState, useCallback } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

export interface CitationChipProps {
  documentName: string;
  page?: number | string | null;
  chunkId?: string;
  score?: number | null;
  /** The raw chunk text (if available from the SSE event). */
  chunkText?: string;
}

/**
 * CitationChip — an inline pill linking to a source document.
 *
 * - Design tokens only: no hex values, no raw Tailwind colour classes.
 * - Keyboard accessible: role="button", tabIndex={0}, Enter/Space to toggle.
 * - Shows documentName + page; on click expands a popover with chunk text.
 */
export function CitationChip({ documentName, page, chunkId: _chunkId, score, chunkText }: CitationChipProps) {
  const cfg = useTenantConfig();
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen(o => !o), []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  const pageLabel = page != null ? ` p.${page}` : '';
  const scoreLabel = score != null ? ` · ${Math.round(score * 100)}%` : '';

  return (
    <div className="inline-flex flex-col items-start">
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        aria-label={`${cfg.citationLabel}: ${documentName}${pageLabel}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-pointer select-none transition-colors"
        style={{
          border: '1px solid hsl(var(--whink-accent) / 0.6)',
          color: 'hsl(var(--muted-foreground))',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <FileText
          className="h-3 w-3 flex-shrink-0"
          style={{ color: 'hsl(var(--whink-accent))' }}
          aria-hidden
        />
        <span className="max-w-[180px] truncate">{documentName}{pageLabel}</span>
        {scoreLabel && <span className="opacity-60">{scoreLabel}</span>}
        {chunkText && (
          open
            ? <ChevronUp className="h-3 w-3 opacity-60" aria-hidden />
            : <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        )}
      </div>

      {/* Expanded chunk text */}
      {open && chunkText && (
        <div
          className="mt-1 p-3 rounded-lg border border-border bg-card text-xs text-muted-foreground max-w-sm max-h-48 overflow-auto"
          style={{ fontFamily: 'var(--font-sans, sans-serif)' }}
          role="region"
          aria-label={`${cfg.citationLabel} excerpt: ${documentName}`}
        >
          <p className="font-mono text-xs mb-1" style={{ color: 'hsl(var(--whink-accent))' }}>
            {cfg.citationLabel}: {documentName}{pageLabel}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">{chunkText}</p>
        </div>
      )}
    </div>
  );
}
