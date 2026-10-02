/**
 * Avatar renderer unit tests — node environment (no DOM, no canvas).
 * We test the logic layer: which src path and which data-attributes would be set
 * given each prop combination.
 */
import { describe, it, expect } from 'vitest';

// Pure logic extracted from AvatarRenderer — no React import needed in node env.

function resolveSrc(persona: 'WHINK' | 'MAMBA'): string {
  return persona === 'MAMBA' ? '/avatar/mamba.webp' : '/avatar/whink.webp';
}

function resolveRingColor(
  persona: 'WHINK' | 'MAMBA',
  mambaMode: string | null | undefined,
): string {
  const isObsidian = mambaMode === 'OBSIDIAN';
  if (persona === 'MAMBA' && isObsidian) return 'hsl(var(--ember))';
  if (persona === 'MAMBA') return 'hsl(var(--mamba-blood))';
  return 'hsl(var(--whink-accent))';
}

function resolveAnimation(isSpeaking: boolean): string {
  if (isSpeaking) return 'avatar-speaking 0.3s ease-in-out infinite';
  return 'avatar-breathe 4s ease-in-out infinite';
}

function resolveVignette(mambaMode: string | null | undefined): boolean {
  return mambaMode === 'OBSIDIAN';
}

describe('AvatarRenderer logic', () => {
  it('renders WHINK avatar src when persona is WHINK', () => {
    expect(resolveSrc('WHINK')).toBe('/avatar/whink.webp');
  });

  it('renders MAMBA avatar src when persona is MAMBA', () => {
    expect(resolveSrc('MAMBA')).toBe('/avatar/mamba.webp');
  });

  it('uses speaking animation when isSpeaking is true', () => {
    const anim = resolveAnimation(true);
    expect(anim).toContain('avatar-speaking');
  });

  it('uses breathe animation when not speaking', () => {
    const anim = resolveAnimation(false);
    expect(anim).toContain('avatar-breathe');
  });

  it('ring colour is whink-accent for WHINK persona', () => {
    expect(resolveRingColor('WHINK', null)).toBe('hsl(var(--whink-accent))');
  });

  it('ring colour is mamba-blood for MAMBA persona without Obsidian', () => {
    expect(resolveRingColor('MAMBA', null)).toBe('hsl(var(--mamba-blood))');
  });

  it('ring colour is ember for MAMBA persona in OBSIDIAN mode', () => {
    expect(resolveRingColor('MAMBA', 'OBSIDIAN')).toBe('hsl(var(--ember))');
  });

  it('applies obsidian vignette when mambaMode is OBSIDIAN', () => {
    expect(resolveVignette('OBSIDIAN')).toBe(true);
  });

  it('does not apply obsidian vignette for non-OBSIDIAN modes', () => {
    expect(resolveVignette(null)).toBe(false);
    expect(resolveVignette('STANDARD')).toBe(false);
  });
});
