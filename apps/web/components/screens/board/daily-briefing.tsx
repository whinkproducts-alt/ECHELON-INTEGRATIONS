'use client';
// R08 daily Board Room briefing. GET /api/briefing/daily gives today's script (built from the account's own records,
// every line linked to its source screen). It opens once per local day on entry; the Founder can Replay, Skip, Mute or
// Refresh it. Speech goes through /api/voice/tts; the avatar mouth follows the real audio through an AnalyserNode.
// When only a browser voice is available the mouth uses a synthetic cadence and the screen says so. Autoplay that the
// browser blocks shows a Play button instead. Lockdown, Local-Only or no speech service leave the transcript only.
import * as React from 'react';
import Link from 'next/link';
import { Play, RotateCcw, SkipForward, Volume2, VolumeX, RefreshCw, Newspaper } from 'lucide-react';
import { HoloButton, HoloModal } from '@/components/ui/holo';
import { WhinkAvatar } from '@/components/avatar/whink-avatar';
import { createAnalyserFeed, type AudioFeed } from '@/components/avatar/avatar-audio-feed';
import type { AvatarState } from '@/components/avatar/avatar-engine';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { isClientLockedDown, onClientLockdown } from '@/lib/safety/client-lockdown';

interface Line { kind: string; text: string; href?: string; unavailable?: boolean }
interface Briefing { id: string | null; localDate: string; revision: number; sourceCutoff: string; generatedAt: string; seen: boolean; lines: Line[] }
type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; briefing: Briefing };
type Voice = 'idle' | 'loading' | 'playing' | 'blocked' | 'unavailable' | 'done';

const LOCAL_ONLY_CLIENT = process.env.NEXT_PUBLIC_WHINK_LOCAL_ONLY === 'true';

export function DailyBriefing() {
  const config = useTenantConfig();
  const name = config.loading ? 'Your assistant' : config.productName;
  const [load, setLoad] = React.useState<Load>({ kind: 'loading' });
  const [open, setOpen] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [voice, setVoice] = React.useState<Voice>('idle');
  const [voiceNote, setVoiceNote] = React.useState<string | null>(null);
  const [current, setCurrent] = React.useState(-1);
  const [feed, setFeed] = React.useState<AudioFeed | null>(null);
  const [synthetic, setSynthetic] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const run = React.useRef(0); // playback generation; a new one cancels the old
  const media = React.useRef<{ audio?: HTMLAudioElement; ctx?: AudioContext; url?: string }>({});

  const stopAudio = React.useCallback(() => {
    run.current++;
    const m = media.current;
    try { m.audio?.pause(); } catch { /* not playing */ }
    if (m.url) URL.revokeObjectURL(m.url);
    void m.ctx?.close().catch(() => {});
    media.current = {};
    try { window.speechSynthesis?.cancel(); } catch { /* unsupported */ }
    setFeed(null); setSynthetic(false); setCurrent(-1);
  }, []);

  const markSeen = React.useCallback((b: Briefing) => {
    if (!b.id || b.seen) return;
    void fetch('/api/briefing/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seen', id: b.id }) }).catch(() => {});
    setLoad((l) => (l.kind === 'ready' && l.briefing.id === b.id ? { kind: 'ready', briefing: { ...l.briefing, seen: true } } : l));
  }, []);

  React.useEffect(() => {
    let live = true;
    fetch('/api/briefing/daily', { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 401 ? 'Sign in again.' : 'The briefing is not available right now.'); return r.json() as Promise<{ briefing: Briefing }>; })
      .then((d) => { if (!live) return; setLoad({ kind: 'ready', briefing: d.briefing }); if (!d.briefing.seen) setOpen(true); })
      .catch((e: unknown) => { if (live) setLoad({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error.' }); });
    return () => { live = false; };
  }, []);

  React.useEffect(() => () => stopAudio(), [stopAudio]);
  React.useEffect(() => onClientLockdown((locked) => { if (locked) { stopAudio(); setVoice('unavailable'); setVoiceNote('Lockdown is active: speech is stopped. The transcript stays available.'); } }), [stopAudio]);

  /** Speak one line. Resolves when finished; throws 'blocked' when the browser refused autoplay. */
  const speakLine = React.useCallback(async (text: string, gen: number): Promise<'ok' | 'unavailable'> => {
    const res = await fetch('/api/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (gen !== run.current) return 'ok';
    if (res.ok) {
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      media.current.url = url; media.current.audio = audio;
      try {
        if (typeof AudioContext !== 'undefined') {
          const ctx = media.current.ctx ?? new AudioContext();
          media.current.ctx = ctx;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6;
          ctx.createMediaElementSource(audio).connect(analyser);
          analyser.connect(ctx.destination);
          if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
          setFeed(createAnalyserFeed(analyser)); setSynthetic(false);
        }
      } catch { setFeed(null); }
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('playback'));
        audio.play().catch((e: unknown) => reject((e as Error)?.name === 'NotAllowedError' ? new Error('blocked') : e));
      });
      URL.revokeObjectURL(url); media.current.url = undefined;
      return 'ok';
    }
    if (res.status === 501 && !LOCAL_ONLY_CLIENT && typeof window !== 'undefined' && window.speechSynthesis) {
      // No server voice: browser voice. Its audio is not reachable, so the mouth cadence is synthetic.
      setFeed(null); setSynthetic(true);
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => resolve(); u.onerror = () => resolve();
        window.speechSynthesis.speak(u);
      });
      return 'ok';
    }
    setVoiceNote(res.status === 423 ? 'Lockdown is active: speech is stopped.' : res.status === 503 ? 'Speech is not available in Local-Only mode.' : 'No speech service answered. Read the transcript below.');
    return 'unavailable';
  }, []);

  const play = React.useCallback(async (b: Briefing) => {
    stopAudio();
    const gen = run.current;
    setVoiceNote(null);
    if (muted || isClientLockedDown()) { setVoice('unavailable'); if (isClientLockedDown()) setVoiceNote('Lockdown is active: speech is stopped.'); markSeen(b); return; }
    setVoice('loading');
    try {
      for (let i = 0; i < b.lines.length; i++) {
        if (gen !== run.current) return;
        setCurrent(i);
        setVoice('playing');
        if ((await speakLine(b.lines[i].text, gen)) === 'unavailable') { setVoice('unavailable'); setCurrent(-1); markSeen(b); return; }
      }
      if (gen !== run.current) return;
      setVoice('done'); setCurrent(-1); setFeed(null); setSynthetic(false);
      markSeen(b);
    } catch (e) {
      if (gen !== run.current) return;
      setFeed(null); setSynthetic(false);
      if ((e as Error)?.message === 'blocked') { setVoice('blocked'); return; }
      setVoice('unavailable'); setVoiceNote('Playback failed. Read the transcript below or try Replay.');
    }
  }, [markSeen, muted, speakLine, stopAudio]);

  // First open of the day: try to start. If the browser blocks audio without a click, the Play button appears.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (open && load.kind === 'ready' && !load.briefing.seen && !started.current) { started.current = true; void play(load.briefing); }
  }, [open, load, play]);

  const close = (o: boolean) => {
    if (o) { setOpen(true); return; }
    stopAudio(); setVoice('idle'); setOpen(false);
    if (load.kind === 'ready') markSeen(load.briefing);
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/briefing/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'regenerate' }) });
      if (!r.ok) { setVoiceNote('Could not refresh the briefing. Try again.'); return; }
      const d = await r.json() as { briefing: Briefing };
      setLoad({ kind: 'ready', briefing: d.briefing });
      void play(d.briefing);
    } finally { setBusy(false); }
  };

  const avatarState: AvatarState = voice === 'playing' ? 'speaking' : voice === 'loading' ? 'thinking' : 'idle';
  const b = load.kind === 'ready' ? load.briefing : null;

  return (
    <>
      <HoloButton variant="ghost" size="sm" onClick={() => { started.current = true; setOpen(true); if (b) void play(b); }} disabled={!b} leftIcon={<Newspaper className="h-4 w-4" aria-hidden />}
        aria-label="Play today's briefing">
        {load.kind === 'loading' ? 'Preparing briefing…' : load.kind === 'error' ? 'Briefing unavailable' : 'Today’s briefing'}
      </HoloButton>
      {load.kind === 'error' && <span role="alert" className="sr-only">{load.message}</span>}
      {b && (
        <HoloModal open={open} onOpenChange={close} title={`Briefing · ${b.localDate}`} width="52rem"
          description={<span className="font-mono text-xs">From records up to {new Date(b.sourceCutoff).toLocaleString()} · revision {b.revision}</span>}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {voice === 'blocked' || voice === 'idle' || voice === 'done' || voice === 'unavailable'
                ? <HoloButton size="sm" onClick={() => void play(b)} leftIcon={voice === 'done' ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}>{voice === 'done' ? 'Replay' : 'Play'}</HoloButton>
                : <HoloButton size="sm" variant="ghost" onClick={() => { stopAudio(); setVoice('done'); markSeen(b); }} leftIcon={<SkipForward className="h-4 w-4" aria-hidden />}>Skip</HoloButton>}
              <HoloButton size="sm" variant="ghost" onClick={() => { setMuted((m) => !m); if (!muted) { stopAudio(); setVoice('idle'); } }} leftIcon={muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</HoloButton>
              <HoloButton size="sm" variant="ghost" onClick={() => void refresh()} loading={busy} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>Refresh from records</HoloButton>
              <HoloButton size="sm" variant="ghost" onClick={() => close(false)}>Close</HoloButton>
            </div>
          }>
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="mx-auto">
              <WhinkAvatar name={name} state={avatarState} audio={feed} width={220}
                hud={[{ label: 'DATE', value: b.localDate }, { label: 'LINES', value: String(b.lines.length) }]} />
              {synthetic && voice === 'playing' && <p className="mt-2 max-w-[220px] text-xs text-muted-foreground">Browser voice: mouth movement is approximate, not driven by the audio.</p>}
            </div>
            <div className="space-y-2" aria-live="polite">
              {voice === 'blocked' && <p role="status" className="text-sm text-[hsl(var(--pending-amber))]">Your browser needs a click before it plays sound. Press Play.</p>}
              {voiceNote && <p role="status" className="text-sm text-muted-foreground">{voiceNote}</p>}
              <ol className="space-y-2" aria-label="Briefing transcript">
                {b.lines.map((l, i) => (
                  <li key={i} className={`rounded-md px-2 py-1 text-sm transition-colors ${i === current ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'} ${l.unavailable ? 'italic' : ''}`} aria-current={i === current ? 'true' : undefined}>
                    {l.text}{' '}
                    {l.href && <Link href={l.href} onClick={() => close(false)} className="font-mono text-xs text-primary underline-offset-2 hover:underline">source</Link>}
                    {l.unavailable && <span className="ml-1 font-mono text-[0.625rem] uppercase text-[hsl(var(--pending-amber))]">unavailable</span>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </HoloModal>
      )}
    </>
  );
}
