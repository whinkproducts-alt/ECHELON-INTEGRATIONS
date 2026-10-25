'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { ClientOnly } from '@/components/client-only';
import { WhinkAvatar } from '../avatar/whink-avatar';
import type { AvatarState } from '../avatar/avatar-engine';

// Glass panel styles — inline only, never raw hex in className
const glassPanel: React.CSSProperties = {
  background: 'rgba(14,21,32,0.82)',
  border: '1px solid rgba(56,182,255,0.16)',
  borderRadius: 16,
  boxShadow: '0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
  backdropFilter: 'blur(16px)',
};

function LiveClock() {
  const [display, setDisplay] = useState('');
  useEffect(() => {
    const fmtTime = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const fmtZone = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton', timeZoneName: 'short',
    });
    const tick = () => {
      const now = new Date();
      const timeParts = fmtZone.formatToParts(now);
      const tz = timeParts.find(p => p.type === 'timeZoneName')?.value ?? '';
      setDisplay(`${fmtTime.format(now)} ${tz}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-xs tabular-nums" style={{ color: 'hsl(var(--whink-accent))' }}>{display}</span>;
}

function WhinkLogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden>
      <circle cx="14" cy="14" r="13" stroke="hsl(var(--whink-accent))" strokeWidth="1.5" />
      <path d="M7 9l3 7 4-5 4 5 3-7" stroke="hsl(var(--whink-accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// Audio bars — 18 bars with staggered animation delays
function AudioBars({ active, color }: { active: boolean; color: string }) {
  const bars = Array.from({ length: 18 }, (_, i) => i);
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 28 }} aria-hidden>
      {bars.map((i) => (
        <div
          key={i}
          className={active ? 'animate-bar' : ''}
          style={{
            width: 3,
            height: 28,
            background: color,
            borderRadius: 2,
            transformOrigin: 'bottom center',
            transform: active ? undefined : 'scaleY(0.15)',
            animationDelay: `${(i * 0.033).toFixed(3)}s`,
            opacity: active ? 1 : 0.3,
            transition: 'opacity 0.3s',
          }}
        />
      ))}
    </div>
  );
}

// Fixture conversation messages
const MESSAGES = [
  { role: 'user' as const, text: 'What are my top priorities today?' },
  { role: 'whink' as const, text: 'Three things need your attention: the investor deck draft is flagged for review, you have a pending Class C approval for the partnership post, and Q4 planning is unscheduled.' },
  { role: 'user' as const, text: 'Schedule the Q4 call with the team for Friday at 2pm.' },
  { role: 'whink' as const, text: 'That will create a calendar event. This is a Class C action — it sends external invites. Confirm with your approval card.' },
];

// Fixture swarm agents
const SWARM = [
  { name: 'backend-engineer', state: 'Thinking…', active: true },
  { name: 'frontend-engineer', state: 'Idle', active: false },
  { name: 'security-reviewer', state: 'Scanning', active: true },
  { name: 'test-engineer', state: 'Running tests', active: true },
];

export function PresenceSurface({ userName = '' }: { userName?: string }) {
  const config = useTenantConfig();
  const productName = config.loading ? 'Your assistant' : config.productName;

  const [listening, setListening] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  // Derive avatar state directly — no effect needed
  const avatarState: AvatarState = listening ? 'listening' : 'idle';

  const toggleMic = useCallback(() => {
    setMicActive((prev) => {
      const next = !prev;
      if (!next) setListening(false);
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraActive((prev) => !prev);
  }, []);

  const toggleListening = useCallback(() => {
    if (!micActive) {
      setMicActive(true);
      setListening(true);
    } else {
      setListening((prev) => !prev);
    }
  }, [micActive]);

  const hud = [
    { label: 'LISTENING', value: listening ? 'ON' : 'OFF' },
    { label: 'MIC', value: micActive ? 'LIVE' : 'OFF' },
  ];

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: '100vw',
        minHeight: '100vh',
        background: '#070B12',
      }}
    >
      {/* Background radial gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(760px 620px at 50% 44%, rgba(11,78,122,0.55), transparent 72%)' }}
      />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="absolute flex items-center justify-between px-5 py-3 z-20"
        style={{ left: 40, right: 40, top: 28, ...glassPanel }}
        aria-label="Header"
      >
        <Link href="/dashboard/holo" className="flex items-center gap-2" aria-label={`${productName} command center`}>
          <WhinkLogoMark />
          <span className="font-display font-bold text-xs tracking-widest uppercase" style={{ color: 'hsl(var(--whink-accent))' }}>
            {productName}
          </span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">· Presence</span>
        </Link>

        <div className="flex items-center gap-4">
          <ClientOnly fallback={<span className="h-4 w-24 rounded bg-secondary animate-pulse" />}>
            <LiveClock />
          </ClientOnly>
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/persona/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mambaMode: 'OBSIDIAN' }),
              });
              window.location.href = '/dashboard/holo/obsidian';
            }}
            className="font-mono text-xs font-semibold transition-colors"
            style={{ color: 'hsl(var(--mamba-blood))' }}
            aria-label="Wake Obsidian mode"
          >
            Wake {config.obsidianLabel ?? 'Obsidian'}
          </button>
        </div>
      </header>

      {/* ── Central avatar zone ─────────────────────────────────── */}
      <div
        className="absolute z-10"
        style={{
          width: 760,
          height: 760,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        aria-label="Avatar zone"
      >
        {/* Outer dashed orbit ring */}
        <div
          aria-hidden
          className="absolute rounded-full animate-spin"
          style={{
            inset: 0,
            border: '1px dashed rgba(56,182,255,0.18)',
            animationDuration: '20s',
            animationTimingFunction: 'linear',
          }}
        />
        {/* Outer orbit bee dot */}
        <div
          aria-hidden
          className="absolute rounded-full animate-spin"
          style={{
            inset: 0,
            animationDuration: '20s',
            animationTimingFunction: 'linear',
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: 8,
              height: 8,
              background: 'hsl(var(--whink-accent))',
              top: -4,
              left: '50%',
              marginLeft: -4,
              boxShadow: '0 0 8px 2px hsl(var(--whink-accent) / 0.6)',
            }}
          />
        </div>

        {/* Middle solid orbit ring */}
        <div
          aria-hidden
          className="absolute rounded-full animate-spin"
          style={{
            inset: 60,
            border: '1px solid rgba(56,182,255,0.28)',
            animationDuration: '14s',
            animationTimingFunction: 'linear',
          }}
        />
        {/* Middle orbit bee dot */}
        <div
          aria-hidden
          className="absolute animate-spin"
          style={{
            inset: 60,
            animationDuration: '14s',
            animationTimingFunction: 'linear',
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: 6,
              height: 6,
              background: 'hsl(var(--whink-accent))',
              top: -3,
              left: '50%',
              marginLeft: -3,
              opacity: 0.7,
            }}
          />
        </div>

        {/* Inner glowing orbit ring — halo animation */}
        <div
          aria-hidden
          className={`absolute rounded-full ${listening ? 'animate-whink-halo' : 'animate-pulse-subtle'}`}
          style={{
            inset: 120,
            border: `1.5px solid rgba(56,182,255,${listening ? '0.55' : '0.35'})`,
            transition: 'border-color 0.5s',
          }}
        />

        {/* Avatar — centered */}
        <div
          className="absolute"
          style={{
            width: 520,
            height: 664,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <WhinkAvatar name={productName} state={avatarState} hud={hud} width={520} />
        </div>
      </div>

      {/* ── Left panel — conversation thread ───────────────────── */}
      <aside
        className="absolute z-20 overflow-hidden"
        style={{ left: 40, top: 110, width: 340, maxHeight: 'calc(100vh - 220px)', ...glassPanel }}
        aria-label="Conversation"
      >
        <div className="p-4 space-y-3 overflow-y-auto h-full">
          <h2 className="font-display text-sm font-semibold tracking-tight" style={{ color: 'hsl(var(--whink-accent))' }}>
            Conversation
          </h2>
          <div className="space-y-3">
            {MESSAGES.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed"
                  style={
                    msg.role === 'user'
                      ? { background: 'rgba(56,182,255,0.18)', color: 'hsl(var(--foreground))', border: '1px solid rgba(56,182,255,0.25)' }
                      : { background: 'rgba(14,21,32,0.9)', color: 'hsl(var(--foreground))', border: '1px solid rgba(56,182,255,0.12)' }
                  }
                >
                  <p className="font-mono text-[10px] mb-1" style={{ color: msg.role === 'user' ? 'hsl(var(--whink-accent))' : 'hsl(var(--muted-foreground))' }}>
                    {msg.role === 'user' ? (userName || 'You') : productName}
                  </p>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          {/* Empty state */}
          {MESSAGES.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
              <p className="text-xs text-muted-foreground">No messages yet. Say "{productName}" to begin.</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── Right top panel — spoken approval ──────────────────── */}
      <section
        className="absolute z-20"
        style={{ right: 40, top: 110, width: 330, ...glassPanel, border: '1px solid rgba(245,166,35,0.35)' }}
        aria-label="Spoken approval"
      >
        <div className="p-4 space-y-3">
          <h2 className="font-display text-sm font-semibold" style={{ color: 'hsl(var(--pending-amber))' }}>
            Spoken approval
          </h2>
          <p className="text-xs text-muted-foreground">
            When {productName} needs your spoken approval, the request and a short code will appear here.
            Say &quot;approve&quot; followed by the code to confirm.
          </p>
          <p className="text-xs text-muted-foreground mt-1">No approval waiting right now.</p>
        </div>
      </section>

      {/* ── Right bottom panel — swarm status ──────────────────── */}
      <section
        className="absolute z-20"
        style={{ right: 40, top: 360, width: 330, ...glassPanel }}
        aria-label="Swarm status"
      >
        <div className="p-4 space-y-3">
          <h2 className="font-display text-sm font-semibold tracking-tight" style={{ color: 'hsl(var(--whink-accent))' }}>
            Swarm
          </h2>
          <ul className="space-y-2">
            {SWARM.map((agent) => (
              <li key={agent.name} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: agent.active ? 'hsl(var(--whink-accent))' : 'hsl(var(--muted-foreground))',
                    boxShadow: agent.active ? '0 0 6px 1px hsl(var(--whink-accent) / 0.5)' : 'none',
                    animation: agent.active ? 'pulse-subtle 2s ease-in-out infinite' : 'none',
                  }}
                />
                <span className="font-mono text-foreground">{agent.name}</span>
                <span className="ml-auto text-muted-foreground">{agent.state}</span>
              </li>
            ))}
          </ul>
          {SWARM.length === 0 && (
            <p className="text-xs text-muted-foreground">No swarm agents running.</p>
          )}
        </div>
      </section>

      {/* ── Bottom bar — mic / camera / status ─────────────────── */}
      <div
        className="absolute z-20 flex items-center gap-4 px-6 py-4"
        style={{
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 880,
          ...glassPanel,
          border: '1px solid rgba(56,182,255,0.22)',
        }}
        role="region"
        aria-label="Voice controls"
      >
        {/* Mic button — large circle, cyan glow when listening */}
        <button
          type="button"
          onClick={toggleListening}
          className="relative shrink-0 rounded-full flex items-center justify-center transition-all"
          style={{
            width: 56,
            height: 56,
            background: listening ? 'rgba(56,182,255,0.22)' : 'rgba(56,182,255,0.08)',
            border: `2px solid ${listening ? 'hsl(var(--whink-accent))' : 'rgba(56,182,255,0.3)'}`,
            boxShadow: listening ? '0 0 20px 6px hsl(var(--whink-accent) / 0.35)' : 'none',
          }}
          aria-label={listening ? 'Stop listening' : 'Start listening'}
          aria-pressed={listening}
        >
          <Mic className="h-6 w-6" aria-hidden style={{ color: 'hsl(var(--whink-accent))' }} />
        </button>

        {/* Status text + audio bars */}
        <div className="flex flex-1 flex-col items-center gap-1">
          <p className="font-display text-lg font-semibold" style={{ color: 'hsl(var(--foreground))' }}>
            {listening ? 'Listening…' : 'Ready'}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {listening ? `Say "${productName}" anytime` : `Say "${productName}" to wake`}
          </p>
          <AudioBars active={listening} color="hsl(var(--whink-accent))" />
        </div>

        {/* Mic kill switch — one-click kill, always visible when live */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleMic}
            className="flex flex-col items-center gap-1"
            aria-label={micActive ? 'Kill microphone (mic is live)' : 'Enable microphone'}
            aria-pressed={micActive}
          >
            <div
              className="rounded-full p-2 transition-colors"
              style={{
                background: micActive ? 'rgba(56,182,255,0.15)' : 'rgba(14,21,32,0.6)',
                border: `1px solid ${micActive ? 'hsl(var(--whink-accent))' : 'rgba(56,182,255,0.2)'}`,
              }}
            >
              {micActive
                ? <Mic className="h-4 w-4" aria-hidden style={{ color: 'hsl(var(--whink-accent))' }} />
                : <MicOff className="h-4 w-4 text-muted-foreground" aria-hidden />}
            </div>
            <span className="font-mono text-[10px]" style={{ color: micActive ? 'hsl(var(--whink-accent))' : 'hsl(var(--muted-foreground))' }}>
              {micActive ? 'MIC LIVE' : 'MIC OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleCamera}
            className="flex flex-col items-center gap-1"
            aria-label={cameraActive ? 'Kill camera (camera is live)' : 'Enable camera'}
            aria-pressed={cameraActive}
          >
            <div
              className="rounded-full p-2 transition-colors"
              style={{
                background: cameraActive ? 'rgba(229,72,77,0.15)' : 'rgba(14,21,32,0.6)',
                border: `1px solid ${cameraActive ? 'hsl(var(--denial))' : 'rgba(56,182,255,0.2)'}`,
              }}
            >
              {cameraActive
                ? <Video className="h-4 w-4" aria-hidden style={{ color: 'hsl(var(--denial))' }} />
                : <VideoOff className="h-4 w-4 text-muted-foreground" aria-hidden />}
            </div>
            <span className="font-mono text-[10px]" style={{ color: cameraActive ? 'hsl(var(--denial))' : 'hsl(var(--muted-foreground))' }}>
              {cameraActive ? 'CAM LIVE' : 'CAM OFF'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
