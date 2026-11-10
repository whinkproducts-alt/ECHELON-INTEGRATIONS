'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AVATAR_STATE_LABELS, BlinkScheduler, MouthTracker, blinkFlagEnabled, breathing, easeLook, transitionPath, portraitMouthPose,
  type AvatarLook, type AvatarState, type EyeAnchor, type PersonaAnimation,
} from './avatar-engine';
import type { AudioFeed } from './avatar-audio-feed';
import { readTokenRgb, rgbCss, type Rgb } from '../holo/holo-color';

export interface HudReadout {
  label: string;
  value: string;
}

export interface AvatarCanvasProps {
  animation: PersonaAnimation;
  state: AvatarState;
  /** Accessible name. Comes from tenant config, never hardcoded here. */
  name: string;
  /** Actual playing audio. Without a feed the portrait stays neutral. */
  audio?: AudioFeed | null;
  /** Live data drawn into the HUD by the interface. Never baked into the art. */
  hud?: readonly HudReadout[];
  width?: number;
  className?: string;
}

type Status = 'loading' | 'ready' | 'error';

function sampleColor(img: HTMLImageElement, fx: number, fy: number, fw: number): Rgb {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 4;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return [0.55, 0.2, 0.2];
  const sw = img.naturalWidth * fw * 0.25, sh = sw * 0.4;
  g.drawImage(img, img.naturalWidth * fx - sw / 2, img.naturalHeight * fy - sh / 2, sw, sh, 0, 0, 8, 4);
  const d = g.getImageData(0, 0, 8, 4).data;
  let r = 0, gr = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4 * 255;
  return [r / n, gr / n, b / n];
}

/** Feathered patch from the original portrait; no painted lips, teeth or dark mouth stamp. */
function buildMouthPatch(img: HTMLImageElement, anim: PersonaAnimation): HTMLCanvasElement {
  const patch = document.createElement('canvas');
  patch.width = Math.round(img.naturalWidth * anim.mouth.width * 1.35);
  patch.height = Math.round(patch.width * 0.62);
  const g = patch.getContext('2d');
  if (!g) return patch;
  g.drawImage(img, img.naturalWidth * anim.mouth.x - patch.width / 2,
    img.naturalHeight * anim.mouth.y - patch.height / 2, patch.width, patch.height,
    0, 0, patch.width, patch.height);
  // The unchanged outer edge blends back into the face instead of making a rectangular seam.
  g.globalCompositeOperation = 'destination-in';
  g.translate(patch.width / 2, patch.height / 2);
  g.scale(patch.width / 2, patch.height / 2);
  const mask = g.createRadialGradient(0, 0, 0.45, 0, 0, 1);
  mask.addColorStop(0, 'rgba(0,0,0,1)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mask; g.fillRect(-1, -1, 2, 2);
  return patch;
}

/**
 * Eyelid for one eye: the skin just above the eye, stretched down over it by the closure amount, clipped to the eye
 * and finished with a soft lash line. Uses the portrait's own pixels, so no extra art or colours are introduced.
 */
function drawLid(g: CanvasRenderingContext2D, img: HTMLImageElement, eye: EyeAnchor, closure: number, px: number, py: number, pw: number, ph: number, lash: Rgb): void {
  if (closure <= 0.02) return;
  const cx = px + eye.x * pw, cy = py + eye.y * ph;
  const ew = eye.w * pw, eh = eye.h * ph;
  const top = cy - eh / 2;
  const lidH = eh * closure;
  g.save();
  g.beginPath(); g.ellipse(cx, cy, ew / 2, eh / 2, 0, 0, Math.PI * 2); g.clip();
  const sx = (eye.x - eye.w / 2) * img.naturalWidth;
  const sh = eye.h * 0.9 * img.naturalHeight;
  const sy = (eye.y - eye.h / 2) * img.naturalHeight - sh;
  g.drawImage(img, sx, sy, eye.w * img.naturalWidth, sh, cx - ew / 2, top, ew, lidH);
  g.strokeStyle = rgbCss(lash, 0.55 * Math.min(1, closure * 1.5));
  g.lineWidth = Math.max(1, eh * 0.09);
  g.beginPath(); g.ellipse(cx, top + lidH - eh / 2 * (1 - closure), ew / 2 * 0.96, eh / 2 * Math.max(0.15, 1 - closure), 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.restore();
}

interface Tokens {
  hud: Rgb; fg: Rgb; amber: Rgb; denial: Rgb; bg: Rgb; font: string;
}

function readTokens(el: Element, hudToken: string): Tokens {
  const style = getComputedStyle(el);
  return {
    hud: readTokenRgb(el, hudToken),
    fg: readTokenRgb(el, '--foreground'),
    amber: readTokenRgb(el, '--pending-amber'),
    denial: readTokenRgb(el, '--denial'),
    bg: readTokenRgb(el, '--background'),
    font: style.getPropertyValue('--font-mono').trim() || 'monospace',
  };
}

function accentFor(state: AvatarState, t: Tokens): Rgb {
  if (state === 'awaiting_approval') return t.amber;
  if (state === 'blocked') return t.denial;
  return t.hud;
}

export function AvatarCanvas({ animation, state, name, audio = null, hud = [], width = 280, className }: AvatarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const motionRef = useRef(motionEnabled);
  useEffect(() => { motionRef.current = motionEnabled; }, [motionEnabled]);
  const height = Math.round(width * 1.22);

  // Props are read inside the animation loop through refs, so the loop never restarts.
  const stateRef = useRef(state); const hudRef = useRef(hud); const audioRef = useRef(audio);
  useEffect(() => { stateRef.current = state; hudRef.current = hud; audioRef.current = audio; }, [state, hud, audio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';

    img.onerror = () => { if (!cancelled) setStatus('error'); };
    img.onload = () => {
      if (cancelled) return;
      const g = canvas.getContext('2d');
      if (!g) { setStatus('error'); return; }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr; canvas.height = height * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tokens = readTokens(canvas, animation.hudToken);
      const mouthPatch = buildMouthPatch(img, animation);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const tracker = new MouthTracker();
      // R08 conditional blink: flag on, eye anchors present, motion allowed. Otherwise nothing changes.
      const blink = blinkFlagEnabled() && animation.eyes ? new BlinkScheduler() : null;
      const lash: Rgb = (() => { const c = sampleColor(img, animation.mouth.x, animation.mouth.y, animation.mouth.width); return [c[0] * 0.15, c[1] * 0.1, c[2] * 0.1]; })();
      let look: AvatarLook = { ...animation.targets.idle };
      let shown: AvatarState = stateRef.current;
      let queue: AvatarState[] = [];
      let wanted: AvatarState = shown;
      let sinceStep = 1e6;
      let last = 0;
      let ring = 0;
      const supportsFilter: boolean = 'filter' in g;
      const margin = width * 0.07;
      const band = height * 0.15;
      const boxW = width - margin * 2, boxH = height - margin * 2 - band;
      const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
      const pw = img.naturalWidth * scale, ph = img.naturalHeight * scale;
      const px = (width - pw) / 2, py = margin;
      const radius = width * 0.06;
      setStatus('ready');

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (document.hidden) { last = now; return; }
        const dt = last ? Math.min(now - last, 100) : 16; last = now;
        sinceStep += dt;

        // State changes: forbidden jumps go through idle, one eased step at a time.
        if (stateRef.current !== wanted) { wanted = stateRef.current; queue = transitionPath(shown, wanted); }
        if (queue.length && sinceStep > animation.tauMs * 1.6) { shown = queue.shift() as AvatarState; sinceStep = 0; }
        look = easeLook(look, animation.targets[shown], dt, animation.tauMs);

        // Mouth follows playback immediately, independently of the eased decorative HUD state.
        const motion = !reducedMotion.matches && motionRef.current ? 1 : 0;
        const speaking = stateRef.current === 'speaking' && motion === 1;
        const sample = speaking ? (audioRef.current?.read() ?? null) : null;
        const mouth = tracker.update(dt, now, speaking, sample);
        ring += dt / 1000 * look.ringSpeed * motion;
        const b = breathing(now / 1000, animation.breathPeriodSec, animation.breathAmp * motion, tracker.loudness);
        const closure = blink && motion ? blink.update(dt) : 0;
        const accent = accentFor(shown, tokens);

        g.clearRect(0, 0, width, height);

        // Glow behind the frame
        g.save();
        g.shadowColor = rgbCss(accent, 0.9);
        g.shadowBlur = 6 + look.glow * 26;
        g.strokeStyle = rgbCss(accent, 0.25 + look.ringAlpha * 0.6);
        g.lineWidth = 1.5;
        g.beginPath(); g.roundRect(px - 4, py - 4, pw + 8, ph + 8, radius + 3); g.stroke();
        g.restore();

        // Portrait with breathing, lean and tilt. Mouth sprite shares the transform so it stays attached.
        g.save();
        g.beginPath(); g.roundRect(px, py, pw, ph, radius); g.clip();
        const cx = px + pw / 2, by = py + ph;
        g.translate(cx, by);
        g.rotate(look.tilt * motion);
        const s = b.scale + look.lean * 0.02 * motion;
        g.scale(s, s);
        g.translate(-cx, -by + b.dy * ph);
        if (supportsFilter) g.filter = `grayscale(${look.desaturate.toFixed(2)})`;
        g.drawImage(img, px, py, pw, ph);
        const pose = portraitMouthPose(tracker.loudness * animation.mouthScale, mouth);
        if (pose.opacity > 0) {
          const mw = mouthPatch.width * scale * pose.xScale;
          const mh = mouthPatch.height * scale * pose.yScale;
          g.save(); g.globalAlpha = pose.opacity;
          g.drawImage(mouthPatch, px + animation.mouth.x * pw - mw / 2,
            py + animation.mouth.y * ph - mh / 2, mw, mh);
          g.restore();
        }
        if (closure > 0 && animation.eyes) {
          drawLid(g, img, animation.eyes.left, closure, px, py, pw, ph, lash);
          drawLid(g, img, animation.eyes.right, closure, px, py, pw, ph, lash);
        }
        if (supportsFilter) g.filter = 'none';
        else if (look.desaturate > 0.01) { g.fillStyle = rgbCss(tokens.bg, look.desaturate * 0.45); g.fillRect(px, py, pw, ph); }
        g.restore();

        // HUD. Everything below is drawn from live props and tokens.
        g.save();
        g.lineCap = 'round';
        // travelling segment around the frame
        const perim = 2 * (pw + ph);
        g.strokeStyle = rgbCss(accent, look.ringAlpha);
        g.lineWidth = 2.5;
        g.setLineDash([perim * Math.max(0.04, look.scanArc), perim]);
        g.lineDashOffset = -ring * perim;
        g.beginPath(); g.roundRect(px - 4, py - 4, pw + 8, ph + 8, radius + 3); g.stroke();
        g.setLineDash([]);
        // corner brackets
        const L = width * (0.07 + 0.05 * look.scanArc);
        g.lineWidth = 2;
        g.strokeStyle = rgbCss(accent, 0.35 + look.ringAlpha * 0.6);
        const x0 = px - 9, y0 = py - 9, x1 = px + pw + 9, y1 = py + ph + 9;
        g.beginPath();
        g.moveTo(x0, y0 + L); g.lineTo(x0, y0); g.lineTo(x0 + L, y0);
        g.moveTo(x1 - L, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + L);
        g.moveTo(x0, y1 - L); g.lineTo(x0, y1); g.lineTo(x0 + L, y1);
        g.moveTo(x1 - L, y1); g.lineTo(x1, y1); g.lineTo(x1, y1 - L);
        g.stroke();
        // scan line while thinking or listening
        if ((shown === 'thinking' || shown === 'listening') && motion) {
          const sy = py + ((now / 1600) % 1) * ph;
          g.fillStyle = rgbCss(accent, 0.18);
          g.fillRect(px, sy - 1, pw, 2);
        }
        // text band: state label always, live readouts beside it
        const ty = py + ph + band * 0.5;
        g.font = `600 ${Math.max(10, width * 0.042)}px ${tokens.font}`;
        g.textBaseline = 'middle';
        g.fillStyle = rgbCss(accent, 0.55 + look.hudAlpha * 0.45);
        g.fillText(AVATAR_STATE_LABELS[shown].toUpperCase(), px, ty - band * 0.2, pw);
        g.font = `400 ${Math.max(9, width * 0.036)}px ${tokens.font}`;
        g.fillStyle = rgbCss(tokens.fg, 0.45 + look.hudAlpha * 0.4);
        const line = hudRef.current.slice(0, 3).map((r) => `${r.label} ${r.value}`).join('  ');
        g.fillText(line, px, ty + band * 0.12, pw);
        g.restore();
      };
      raf = requestAnimationFrame(frame);
    };
    img.src = animation.portrait;
    return () => { cancelled = true; cancelAnimationFrame(raf); img.onload = null; img.onerror = null; };
  }, [animation, width, height, attempt]);

  const retry = useCallback(() => { setStatus('loading'); setAttempt((n) => n + 1); }, []);

  return (
    <figure className={`relative inline-block ${className ?? ''}`} style={{ width }} data-avatar-state={state} data-motion-enabled={motionEnabled}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ width, height }} className="block" />
      {status === 'loading' && (
        <div role="status" aria-busy="true" className="absolute inset-0 animate-pulse rounded-lg bg-card" style={{ height }}>
          <span className="sr-only">Loading {name}</span>
        </div>
      )}
      {status === 'error' && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg border border-[hsl(var(--denial))] bg-card p-3 text-center text-xs" style={{ height }}>
          <p className="text-[hsl(var(--denial))]">Error: portrait failed to load.</p>
          <button type="button" onClick={retry} className="rounded-md bg-secondary px-3 py-1 text-foreground hover:opacity-80">Retry</button>
        </div>
      )}
      <figcaption className="mt-1 flex items-baseline justify-between gap-2 text-xs" role="status" aria-live="polite">
        <span className="font-medium text-foreground">{name}</span>
        <span className="font-mono text-muted-foreground" data-testid="avatar-state-label">{AVATAR_STATE_LABELS[state]}</span>
      </figcaption>
      <button type="button" onClick={() => setMotionEnabled((enabled) => !enabled)} aria-pressed={motionEnabled}
        aria-label={`${motionEnabled ? 'Turn off' : 'Turn on'} avatar animation`}
        className="mt-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Animation {motionEnabled ? 'on' : 'off'}
      </button>
    </figure>
  );
}
