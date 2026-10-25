'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PersonaAvatar } from '@/components/ui/persona-avatar';
import { ClientOnly } from '@/components/client-only';

// Glass panel style — tokens only, no raw hex
const glassPanel: React.CSSProperties = {
  background: 'rgba(14,21,32,0.78)',
  border: '1px solid rgba(56,182,255,0.16)',
  borderRadius: 16,
  boxShadow: '0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
  backdropFilter: 'blur(12px)',
};

type Category = 'all' | 'tech' | 'ai' | 'business' | 'canada' | 'market';

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'all', label: 'ALL' },
  { id: 'tech', label: 'TECH' },
  { id: 'ai', label: 'AI' },
  { id: 'business', label: 'BUSINESS' },
  { id: 'canada', label: 'CANADA' },
  { id: 'market', label: 'MARKET' },
];

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  excerpt: string;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  if (isNaN(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SkeletonCard() {
  return (
    <div
      style={{
        ...glassPanel,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ height: 12, borderRadius: 6, background: 'rgba(56,182,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite', width: '40%' }} />
      <div style={{ height: 16, borderRadius: 6, background: 'rgba(56,182,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ height: 16, borderRadius: 6, background: 'rgba(56,182,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite', width: '80%' }} />
      <div style={{ height: 40, borderRadius: 6, background: 'rgba(56,182,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  // timeAgo is browser-only (Date.now) — rendered only in ClientOnly
  return (
    <article
      style={{
        ...glassPanel,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 0.15s',
      }}
    >
      {/* Source row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <PersonaAvatar name={item.source} size="sm" />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'hsl(var(--muted-foreground))',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.source}
        </span>
        <ClientOnly fallback={<span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'hsl(var(--muted-foreground))' }} />}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
            {timeAgo(item.pubDate)}
          </span>
        </ClientOnly>
      </div>

      {/* Headline */}
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '13px',
          color: 'hsl(var(--foreground))',
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {item.title}
      </h3>

      {/* Excerpt */}
      {item.excerpt && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            color: 'hsl(var(--muted-foreground))',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            margin: 0,
          }}
        >
          {item.excerpt}
        </p>
      )}

      {/* Read link */}
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'hsl(var(--whink-accent))',
          textDecoration: 'none',
          marginTop: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
        aria-label={`Read: ${item.title}`}
      >
        Read
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 8L8 2M8 2H4M8 2V6" stroke="hsl(var(--whink-accent))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </article>
  );
}

export function NewsSurface() {
  const [category, setCategory] = useState<Category>('all');
  const [items, setItems] = useState<NewsItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  const fetchNews = useCallback((cat: Category) => {
    setLoadState('loading');
    fetch(`/api/news?category=${cat}`)
      .then((r) => {
        if (!r.ok) throw new Error('fetch_failed');
        return r.json() as Promise<{ items: NewsItem[]; fetchedAt: string }>;
      })
      .then((data) => {
        setItems(data.items);
        setFetchedAt(data.fetchedAt);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNews(category);
  }, [category, fetchNews]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const t = setInterval(() => fetchNews(category), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [category, fetchNews]);

  return (
    <div
      className="relative min-h-screen"
      style={{ background: '#070B12' }}
    >
      {/* Radial background gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(1200px 700px at 50% 18%, rgba(11,78,122,0.40), transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1440px] px-6 py-6 space-y-5">

        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Pulsing LIVE dot */}
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'hsl(var(--whink-accent))',
                boxShadow: '0 0 0 0 hsl(var(--whink-accent) / 0.7)',
                animation: 'livePulse 2s ease-in-out infinite',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '22px',
                color: 'hsl(var(--foreground))',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Intelligence Feed
            </h1>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'hsl(var(--whink-accent))',
                background: 'rgba(56,182,255,0.08)',
                border: '1px solid rgba(56,182,255,0.2)',
                borderRadius: 6,
                padding: '2px 7px',
                letterSpacing: '0.08em',
              }}
            >
              LIVE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Last updated */}
            {fetchedAt && (
              <ClientOnly fallback={<span />}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'hsl(var(--muted-foreground))' }}>
                  Updated {timeAgo(fetchedAt)}
                </span>
              </ClientOnly>
            )}

            {/* Back to home link */}
            <Link
              href="/dashboard/holo"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'hsl(var(--muted-foreground))',
                textDecoration: 'none',
              }}
            >
              ← Command Center
            </Link>
          </div>
        </header>

        {/* Category tabs */}
        <div
          role="tablist"
          aria-label="News category filter"
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={category === cat.id}
              onClick={() => setCategory(cat.id)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: '11px',
                letterSpacing: '0.08em',
                padding: '5px 12px',
                borderRadius: 8,
                border: category === cat.id
                  ? '1px solid rgba(56,182,255,0.5)'
                  : '1px solid rgba(56,182,255,0.15)',
                background: category === cat.id
                  ? 'rgba(56,182,255,0.12)'
                  : 'rgba(14,21,32,0.5)',
                color: category === cat.id
                  ? 'hsl(var(--whink-accent))'
                  : 'hsl(var(--muted-foreground))',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loadState === 'loading' && (
          <div
            role="status"
            aria-busy="true"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
            <span className="sr-only">Loading intelligence feed</span>
          </div>
        )}

        {/* Error state */}
        {loadState === 'error' && (
          <div
            role="alert"
            style={{
              ...glassPanel,
              padding: '32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              textAlign: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
              <circle cx="16" cy="16" r="14" stroke="hsl(var(--denial))" strokeWidth="1.5" />
              <path d="M16 10v7M16 21v1" stroke="hsl(var(--denial))" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'hsl(var(--denial))' }}>
              Feed unavailable
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>
              Could not load news feeds. Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => fetchNews(category)}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                padding: '7px 16px',
                borderRadius: 8,
                border: '1px solid rgba(56,182,255,0.3)',
                background: 'rgba(56,182,255,0.08)',
                color: 'hsl(var(--whink-accent))',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {loadState === 'ready' && items.length === 0 && (
          <div
            style={{
              ...glassPanel,
              padding: '32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              textAlign: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
              <rect x="4" y="8" width="24" height="18" rx="3" stroke="rgba(56,182,255,0.4)" strokeWidth="1.5" />
              <path d="M10 14h12M10 19h8" stroke="rgba(56,182,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'hsl(var(--foreground))' }}>
              No stories yet
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>
              No articles found for this category right now. Try another filter or check back shortly.
            </p>
          </div>
        )}

        {/* Ready — news grid */}
        {loadState === 'ready' && items.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {items.map((item) => (
              <NewsCard key={item.link} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Keyframe for pulsing live dot */}
      <style>{`
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(56,182,255,0.6); }
          50% { box-shadow: 0 0 0 6px rgba(56,182,255,0); }
        }
      `}</style>
    </div>
  );
}
