'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { ClientOnly } from '@/components/client-only';
import { MambaAvatar } from '../avatar/mamba-avatar';
import type { AvatarState } from '../avatar/avatar-engine';

// MAMBA panel style — blood red border
const mambaPanel: React.CSSProperties = {
  background: 'rgba(20,10,12,0.76)',
  border: '1px solid rgba(196,30,30,0.32)',
  borderRadius: 16,
  boxShadow: '0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.02)',
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
  return <span className="font-mono text-xs tabular-nums" style={{ color: 'hsl(var(--ember))' }}>{display}</span>;
}

// MAMBA logo — M shape in ember red
function MambaLogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden>
      <circle cx="14" cy="14" r="13" stroke="hsl(var(--ember))" strokeWidth="1.5" />
      <path
        d="M6 20V9l8 7 8-7v11"
        stroke="hsl(var(--ember))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// Audio bars — ember red
function AudioBars({ active }: { active: boolean }) {
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
            background: 'hsl(var(--ember))',
            borderRadius: 2,
            transformOrigin: 'bottom center',
            transform: active ? undefined : 'scaleY(0.15)',
            animationDelay: `${(i * 0.033).toFixed(3)}s`,
            opacity: active ? 1 : 0.35,
            transition: 'opacity 0.3s',
          }}
        />
      ))}
    </div>
  );
}

type WarRoomTab = 'move' | 'exposure' | 'counter';

const WAR_ROOM_CONTENT: Record<WarRoomTab, { headline: string; body: string; threat: 'HIGH' | 'MED' | 'LOW' }> = {
  move: {
    headline: 'They bundle it for free.',
    body: 'Primary competitor is offering their core scheduling feature at no cost as part of their platform deal. This removes price as a differentiator and accelerates their land-and-expand motion in enterprise accounts.',
    threat: 'HIGH',
  },
  exposure: {
    headline: 'Three enterprise accounts at risk.',
    body: 'Accounts over $50K ARR where the competitor has existing relationships: Meridian Group, Atlas Partners, and NovaTech. Each is mid-contract renewal cycle — high switching probability if bundled offer lands.',
    threat: 'MED',
  },
  counter: {
    headline: 'Lock in with depth, not price.',
    body: 'Counter with the integration moat: surface the 14 connectors they cannot match. Prioritise outreach to Meridian this week. Frame the bundle as shallow — their free tier has no audit trail, no permission engine, no white label.',
    threat: 'LOW',
  },
};

const RISKS = [
  { level: 'HIGH' as const, text: 'Competitor bundling removes price moat in enterprise tier' },
  { level: 'MED' as const, text: 'Three accounts in renewal window without recent QBR' },
  { level: 'MED' as const, text: 'Platform dependency on primary API could shift terms' },
  { level: 'LOW' as const, text: 'Legal review for new jurisdiction not yet scheduled' },
];

const OBSIDIAN_SWARM = [
  { name: 'adversarial-analyst', state: 'War gaming', active: true },
  { name: 'backend-engineer', state: 'Idle', active: false },
  { name: 'security-reviewer', state: 'Threat scan', active: true },
];

const THREAT_COLORS: Record<'HIGH' | 'MED' | 'LOW', React.CSSProperties> = {
  HIGH: { background: 'rgba(196,30,30,0.15)', border: '1px solid rgba(196,30,30,0.4)', color: 'hsl(var(--mamba-blood))' },
  MED: { background: 'rgba(143,163,184,0.1)', border: '1px solid rgba(143,163,184,0.4)', color: '#8FA3B8' },
  LOW: { background: 'rgba(14,21,32,0.6)', border: '1px solid rgba(255,255,255,0.08)', color: 'hsl(var(--muted-foreground))' },
};

export function ObsidianSurface() {
  const config = useTenantConfig();
  const productName = config.loading ? 'Your assistant' : config.productName;

  const [activeTab, setActiveTab] = useState<WarRoomTab>('move');
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
    { label: 'MODE', value: 'OBSIDIAN' },
    { label: 'MIC', value: micActive ? 'LIVE' : 'OFF' },
  ];

  const content = WAR_ROOM_CONTENT[activeTab];

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: '100vw',
        minHeight: '100vh',
        background: '#070B12',
      }}
    >
      {/* MAMBA radial glow — blood red */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(760px 620px at 50% 44%, rgba(122,14,14,0.6), transparent 72%)' }}
      />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="absolute flex items-center justify-between px-5 py-3 z-20"
        style={{ left: 40, right: 40, top: 28, ...mambaPanel }}
        aria-label="Obsidian header"
      >
        <div className="flex items-center gap-3">
          <MambaLogoMark />
          <div>
            <span className="font-display font-bold text-sm tracking-widest uppercase" style={{ color: 'hsl(var(--ember))' }}>
              {config.obsidianLabel ?? 'Obsidian'}
            </span>
            <span className="ml-2 font-mono text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Obsidian mode · adversarial strategist
            </span>
          </div>
          {/* Lawful moves chip */}
          <span
            className="rounded-full px-2.5 py-0.5 font-mono text-xs"
            style={{ border: '1px solid rgba(196,30,30,0.4)', background: 'rgba(196,30,30,0.08)', color: 'hsl(var(--mamba-blood))' }}
          >
            Lawful moves only
          </span>
          {/* Same memory chip */}
          <span
            className="rounded-full px-2.5 py-0.5 font-mono text-xs text-muted-foreground"
            style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)' }}
          >
            Same memory · same permissions
          </span>
        </div>

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
                body: JSON.stringify({ mambaMode: null }),
              });
              window.location.href = '/dashboard/holo';
            }}
            className="rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors"
            style={{
              border: '1px solid rgba(56,182,255,0.3)',
              background: 'rgba(56,182,255,0.06)',
              color: 'hsl(var(--whink-accent))',
            }}
            aria-label={`Back to ${productName} chief of staff`}
          >
            ← Back to {productName}
          </button>
        </div>
      </header>

      {/* ── Central avatar zone — MAMBA ────────────────────────── */}
      <div
        className="absolute z-10"
        style={{
          width: 760,
          height: 760,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        aria-label="Obsidian avatar zone"
      >
        {/* Outer dashed orbit ring — reversed (ember) */}
        <div
          aria-hidden
          className="absolute rounded-full animate-spin-ccw"
          style={{
            inset: 0,
            border: '1px dashed rgba(255,74,28,0.30)',
          }}
        />
        {/* Outer orbit bee dot — ember */}
        <div
          aria-hidden
          className="absolute rounded-full animate-spin-ccw"
          style={{ inset: 0 }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: 8,
              height: 8,
              background: 'hsl(var(--ember))',
              top: -4,
              left: '50%',
              marginLeft: -4,
              boxShadow: '0 0 10px 3px hsl(var(--ember) / 0.6)',
            }}
          />
        </div>

        {/* Middle orbit ring — ember */}
        <div
          aria-hidden
          className="absolute rounded-full animate-spin"
          style={{
            inset: 60,
            border: '1px solid rgba(255,74,28,0.28)',
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
              background: 'hsl(var(--ember))',
              top: -3,
              left: '50%',
              marginLeft: -3,
              opacity: 0.7,
            }}
          />
        </div>

        {/* Inner glowing orbit ring — ember halo animation */}
        <div
          aria-hidden
          className={`absolute rounded-full ${listening ? 'animate-ember-halo' : 'animate-pulse-subtle'}`}
          style={{
            inset: 120,
            border: `1.5px solid rgba(255,74,28,${listening ? '0.55' : '0.45'})`,
            transition: 'border-color 0.5s',
          }}
        />

        {/* MAMBA avatar */}
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
          <MambaAvatar name="Adversarial strategist" state={avatarState} hud={hud} width={520} />
        </div>
      </div>

      {/* ── Left panel — war room brief ─────────────────────────── */}
      <aside
        className="absolute z-20 overflow-hidden"
        style={{ left: 40, top: 110, width: 360, ...mambaPanel }}
        aria-label="War room brief"
      >
        <div className="p-4 space-y-3">
          <h2 className="font-display text-sm font-semibold tracking-tight" style={{ color: 'hsl(var(--ember))' }}>
            War Room Brief
          </h2>

          {/* Platform tabs */}
          <div className="flex gap-1" role="tablist" aria-label="War room view">
            {([
              { id: 'move' as WarRoomTab, label: 'Their Move' },
              { id: 'exposure' as WarRoomTab, label: 'Your Exposure' },
              { id: 'counter' as WarRoomTab, label: 'Counter' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                style={
                  activeTab === tab.id
                    ? { background: 'rgba(255,74,28,0.15)', color: 'hsl(var(--ember))', border: '1px solid rgba(255,74,28,0.3)' }
                    : { background: 'transparent', color: 'hsl(var(--muted-foreground))', border: '1px solid rgba(255,255,255,0.06)' }
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div
            role="tabpanel"
            aria-label={`${activeTab} analysis`}
            className="rounded-lg p-3 space-y-2"
            style={{ background: 'rgba(196,30,30,0.06)', border: '1px solid rgba(196,30,30,0.18)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-sm font-bold text-foreground leading-tight">{content.headline}</p>
              <span
                className="shrink-0 rounded px-2 py-0.5 font-mono text-xs font-bold"
                style={THREAT_COLORS[content.threat]}
                aria-label={`Threat level: ${content.threat}`}
              >
                {content.threat}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{content.body}</p>
          </div>
        </div>
      </aside>

      {/* ── Right top panel — pre-mortem risks ──────────────────── */}
      <section
        className="absolute z-20"
        style={{ right: 40, top: 110, width: 330, ...mambaPanel }}
        aria-label="Pre-mortem risks"
      >
        <div className="p-4 space-y-3">
          <h2 className="font-display text-sm font-semibold tracking-tight" style={{ color: 'hsl(var(--ember))' }}>
            Pre-mortem risks
          </h2>
          <ul className="space-y-2">
            {RISKS.map((risk, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold leading-tight mt-0.5"
                  style={THREAT_COLORS[risk.level]}
                  aria-label={`Severity: ${risk.level}`}
                >
                  {risk.level}
                </span>
                <span className="text-foreground leading-relaxed">{risk.text}</span>
              </li>
            ))}
          </ul>
          {RISKS.length === 0 && (
            <p className="text-xs text-muted-foreground">No risks identified yet.</p>
          )}
        </div>
      </section>

      {/* ── Right bottom panel — obsidian swarm ─────────────────── */}
      <section
        className="absolute z-20"
        style={{ right: 40, top: 446, width: 330, ...mambaPanel }}
        aria-label="Obsidian swarm"
      >
        <div className="p-4 space-y-3">
          <h2 className="font-display text-sm font-semibold tracking-tight" style={{ color: 'hsl(var(--ember))' }}>
            Obsidian Swarm
          </h2>
          <ul className="space-y-2">
            {OBSIDIAN_SWARM.map((agent) => (
              <li key={agent.name} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: agent.active ? 'hsl(var(--ember))' : 'hsl(var(--muted-foreground))',
                    boxShadow: agent.active ? '0 0 6px 1px hsl(var(--ember) / 0.5)' : 'none',
                  }}
                />
                <span className="font-mono text-foreground">{agent.name}</span>
                <span className="ml-auto" style={{ color: agent.active ? 'hsl(var(--ember))' : 'hsl(var(--muted-foreground))' }}>
                  {agent.state}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Bottom bar — MAMBA voice controls ──────────────────── */}
      <div
        className="absolute z-20 flex items-center gap-4 px-6 py-4"
        style={{
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 880,
          background: 'rgba(20,10,12,0.82)',
          border: '1px solid rgba(255,74,28,0.5)',
          borderRadius: 16,
          boxShadow: `0 24px 60px rgba(0,0,0,0.55), ${listening ? '0 0 30px 10px rgba(255,74,28,0.15)' : 'none'}`,
          backdropFilter: 'blur(16px)',
        }}
        role="region"
        aria-label="Obsidian voice controls"
      >
        {/* Mic button — ember glow when listening */}
        <button
          type="button"
          onClick={toggleListening}
          className="relative shrink-0 rounded-full flex items-center justify-center transition-all"
          style={{
            width: 56,
            height: 56,
            background: listening ? 'rgba(255,74,28,0.22)' : 'rgba(255,74,28,0.08)',
            border: `2px solid ${listening ? 'hsl(var(--ember))' : 'rgba(255,74,28,0.35)'}`,
            boxShadow: listening ? '0 0 20px 6px hsl(var(--ember) / 0.35)' : 'none',
          }}
          aria-label={listening ? 'Stop listening' : 'Start listening'}
          aria-pressed={listening}
        >
          <Mic className="h-6 w-6" aria-hidden style={{ color: 'hsl(var(--ember))' }} />
        </button>

        {/* Status text */}
        <div className="flex flex-1 flex-col items-center gap-1">
          <p className="font-display text-lg font-semibold" style={{ color: listening ? 'hsl(var(--ember))' : 'hsl(var(--foreground))' }}>
            {listening ? 'Obsidian is listening.' : 'Obsidian is awake. Bring me a plan to break.'}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            Say &quot;{productName}&quot; to return to your chief of staff
          </p>
          <AudioBars active={listening} />
        </div>

        {/* Mic / Camera kill switches */}
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
                background: micActive ? 'rgba(255,74,28,0.15)' : 'rgba(20,10,12,0.6)',
                border: `1px solid ${micActive ? 'hsl(var(--ember))' : 'rgba(255,74,28,0.25)'}`,
              }}
            >
              {micActive
                ? <Mic className="h-4 w-4" aria-hidden style={{ color: 'hsl(var(--ember))' }} />
                : <MicOff className="h-4 w-4 text-muted-foreground" aria-hidden />}
            </div>
            <span className="font-mono text-[10px]" style={{ color: micActive ? 'hsl(var(--ember))' : 'hsl(var(--muted-foreground))' }}>
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
                background: cameraActive ? 'rgba(229,72,77,0.15)' : 'rgba(20,10,12,0.6)',
                border: `1px solid ${cameraActive ? 'hsl(var(--denial))' : 'rgba(255,74,28,0.25)'}`,
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
