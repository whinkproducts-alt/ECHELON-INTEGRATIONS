import { describe, it, expect } from 'vitest';
import {
  AVATAR_STATES, AVATAR_STATE_LABELS, MOUTH_SHAPES, MouthTracker, breathing, canTransition, classifyMouth, easeLook, transitionPath, portraitMouthPose,
} from '@/components/avatar/avatar-engine';
import { whinkAvatarAnimation } from '@/components/avatar/whink-avatar-animations';
import { mambaAvatarAnimation } from '@/components/avatar/mamba-avatar-animations';
import { createAnalyserFeed } from '@/components/avatar/avatar-audio-feed';
import { ledgerToSecurityEvents } from '@/components/neural-link/security-events';

describe('avatar states', () => {
  it('has six states, each with a text label', () => {
    expect(AVATAR_STATES.length).toBe(6);
    for (const s of AVATAR_STATES) expect(AVATAR_STATE_LABELS[s].length).toBeGreaterThan(0);
  });
  it('routes a forbidden jump through idle', () => {
    expect(canTransition('blocked', 'speaking')).toBe(false);
    expect(transitionPath('blocked', 'speaking')).toEqual(['idle', 'speaking']);
    expect(transitionPath('idle', 'speaking')).toEqual(['speaking']);
  });
  it('both personas define a look for every state', () => {
    for (const a of [whinkAvatarAnimation, mambaAvatarAnimation]) for (const s of AVATAR_STATES) expect(a.targets[s]).toBeDefined();
  });
  it('personas use tokens, not colours', () => {
    expect(whinkAvatarAnimation.hudToken).toBe('--hud-whink');
    expect(mambaAvatarAnimation.hudToken).toBe('--hud-mamba');
  });
  it('eases toward the target and settles in roughly 250 ms at the default tau', () => {
    let look = { ...whinkAvatarAnimation.targets.idle };
    const target = whinkAvatarAnimation.targets.speaking;
    for (let t = 0; t < 250; t += 16) look = easeLook(look, target, 16, whinkAvatarAnimation.tauMs);
    expect(Math.abs(look.glow - target.glow)).toBeLessThan(0.25 * Math.abs(whinkAvatarAnimation.targets.idle.glow - target.glow));
  });
  it('does not blink: there is no blink shape or parameter', () => {
    expect(MOUTH_SHAPES).not.toContain('blink' as never);
    expect(Object.keys(whinkAvatarAnimation.targets.idle)).not.toContain('blink');
  });
});

describe('mouth shapes', () => {
  it('has six shapes', () => expect(MOUTH_SHAPES.length).toBe(6));
  it('maps loudness and brightness to different shapes', () => {
    expect(classifyMouth(0.01, 0.5)).toBe('closed');
    expect(classifyMouth(0.7, 0.1)).toBe('open');
    expect(classifyMouth(0.2, 0.1)).toBe('round');
    expect(classifyMouth(0.6, 0.9)).toBe('wide');
    expect(classifyMouth(0.15, 0.9)).toBe('teeth');
  });
  it('rests when not speaking and after sustained silence', () => {
    const t = new MouthTracker();
    expect(t.update(16, 0, false, null)).toBe('rest');
    let shape = 'rest';
    for (let ms = 0; ms < 600; ms += 16) shape = t.update(16, ms, true, { rms: 0, centroid: 0.5 });
    expect(shape).toBe('rest');
  });
  it('holds a shape for the minimum time so it does not flicker', () => {
    const t = new MouthTracker(70);
    let changes = 0, prev = '';
    for (let ms = 0; ms < 2000; ms += 16) {
      const s = t.update(16, ms, true, { rms: 0.6, centroid: (ms / 16) % 2 ? 0.9 : 0.1 });
      if (s !== prev) changes++;
      prev = s;
    }
    expect(changes).toBeLessThan(2000 / 70 + 2);
  });
  it('never invents speaking movement without a live feed', () => {
    const t = new MouthTracker();
    for (let ms = 0; ms < 5000; ms += 16) expect(t.update(16, ms, true, null)).toBe('rest');
    expect(t.loudness).toBe(0);
  });
  it('missing spectral data does not invent changing mouth shapes over time', () => {
    const early = new MouthTracker(); const later = new MouthTracker();
    for (let i = 0; i < 30; i++) {
      expect(early.update(16, i * 16, true, { rms: 0.4 })).toBe(later.update(16, 9000 + i * 16, true, { rms: 0.4 }));
    }
  });
  it('closes within 80 ms of silence, regardless of a held loud syllable', () => {
    const t = new MouthTracker();
    for (let ms = 0; ms < 200; ms += 16) t.update(16, ms, true, { rms: 1, centroid: 0.1 });
    expect(t.loudness).toBeGreaterThan(0.8);
    for (let ms = 0; ms < 80; ms += 16) t.update(16, ms, true, { rms: 0 });
    expect(t.loudness).toBe(0);
    expect(t.update(16, 300, true, { rms: 0 })).toBe('rest');
  });
  it('stops immediately on playback cancellation or a lost feed', () => {
    for (const sample of [null, { rms: Number.NaN }]) {
      const t = new MouthTracker();
      t.update(100, 0, true, { rms: 1 });
      expect(t.update(1, 100, true, sample)).toBe('rest');
      expect(t.loudness).toBe(0);
    }
    const t = new MouthTracker(); t.update(100, 0, true, { rms: 1 });
    expect(t.update(1, 100, false, { rms: 1 })).toBe('rest');
    expect(t.loudness).toBe(0);
  });
  it('deforms original portrait lips within a restrained range and leaves silence untouched', () => {
    for (const shape of MOUTH_SHAPES) for (const level of [0, 0.2, 0.7, 1, 200, Number.NaN]) {
      const p = portraitMouthPose(level, shape);
      expect(p.xScale).toBeGreaterThanOrEqual(0.975); expect(p.xScale).toBeLessThanOrEqual(1.018);
      expect(p.yScale).toBeGreaterThanOrEqual(1); expect(p.yScale).toBeLessThanOrEqual(1.12);
      expect(p.opacity).toBeGreaterThanOrEqual(0); expect(p.opacity).toBeLessThanOrEqual(1);
    }
    expect(portraitMouthPose(0, 'open').opacity).toBe(0);
    expect(portraitMouthPose(1, 'rest').opacity).toBe(0);
  });
  it('reads loudness and centroid from an analyser', () => {
    const feed = createAnalyserFeed({ frequencyBinCount: 256, getByteFrequencyData: (a) => a.fill(0, 0).fill(200, 0, 10) });
    const s = feed.read();
    expect(s.rms).toBeGreaterThan(0.1);
    expect(s.centroid).toBeLessThan(0.3);
  });
  it('uses waveform silence even when the spectrum retains smoothed energy', () => {
    const feed = createAnalyserFeed({ frequencyBinCount: 256, getByteFrequencyData: a => a.fill(200), getByteTimeDomainData: a => a.fill(128) });
    expect(feed.read().rms).toBe(0);
  });
  it('suppresses stale analyser samples while paused, ended or buffering', () => {
    const playback = { paused: false, ended: false, readyState: 4 };
    const feed = createAnalyserFeed({ frequencyBinCount: 256, getByteFrequencyData: a => a.fill(200), getByteTimeDomainData: a => a.fill(160) }, playback);
    expect(feed.read().rms).toBeGreaterThan(0);
    playback.paused = true; expect(feed.read().rms).toBe(0);
    playback.paused = false; playback.ended = true; expect(feed.read().rms).toBe(0);
    playback.ended = false; playback.readyState = 2; expect(feed.read().rms).toBe(0);
    playback.readyState = 4; expect(feed.read().rms).toBeGreaterThan(0);
  });
});

describe('breathing', () => {
  it('stays within a small band', () => {
    for (let t = 0; t < 10; t += 0.1) {
      const b = breathing(t, 4.2, 0.008, 0);
      expect(b.scale).toBeGreaterThanOrEqual(1);
      expect(b.scale).toBeLessThan(1.02);
    }
  });
});

describe('security events from the ledger', () => {
  it('maps injection, hash and denied rows and ignores normal rows', () => {
    const rows = [
      { id: '1', action: 'injection_blocked', status: 'DENIED', createdAt: '2026-10-23T10:00:00Z', outputSummary: 'ignore previous' },
      { id: '2', action: 'tool_executed', status: 'VALIDATED', createdAt: '2026-10-23T10:01:00Z' },
      { id: '3', action: 'approval_hash_mismatch', status: 'FAILED', createdAt: '2026-10-23T10:02:00Z' },
      { id: '4', action: 'tool_denied', status: 'DENIED', createdAt: '2026-10-23T10:03:00Z' },
      { id: '5', action: 'x', status: 'DENIED', createdAt: 'not a date' },
    ];
    const out = ledgerToSecurityEvents(rows);
    expect(out.map((e) => e.kind)).toEqual(['injection_blocked', 'approval_hash_mismatch', 'action_blocked']);
    expect(ledgerToSecurityEvents({ nope: 1 })).toEqual([]);
  });
});
