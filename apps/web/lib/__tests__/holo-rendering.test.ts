import { describe, it, expect } from 'vitest';
import { statSync, readFileSync } from 'fs';
import path from 'path';
import { fibonacciSphere, minNeighbourDistance, orbRadiusFor } from '@/components/holo/holo-fibonacci';
import { cullAndLod, extractFrustumPlanes, lodForDistance, lodForScreenSize, sphereInFrustum } from '@/components/holo/holo-culling-lod';
import { FpsMeter, fpsVerdict, FRAME_BUDGET_MS } from '@/components/holo/holo-fps';
import { hslTripletToRgb } from '@/components/holo/holo-color';
import { HOLO_AGENT_COUNT, HOLO_ORB_STATES, HOLO_STATE_LABELS, HOLO_STATE_TOKENS, countByState } from '@/components/holo/holo-types';
import { fixtureAgents } from '@/components/holo/holo-fixtures';

/** Column major perspective * lookAt(0,0,d -> origin) matrix, built by hand so no three.js import is needed. */
function viewProj(dist: number, fovDeg = 45, aspect = 1, near = 0.1, far = 50): number[] {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -dist, 1];
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += proj[k * 4 + r] * view[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}

describe('fibonacci sphere', () => {
  const pos = fibonacciSphere(HOLO_AGENT_COUNT, 1);
  it('places exactly 326 points on the unit sphere', () => {
    expect(pos.length).toBe(326 * 3);
    for (let i = 0; i < 326; i++) {
      expect(Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])).toBeCloseTo(1, 5);
    }
  });
  it('leaves no overlapping orbs: closest pair is near the ideal spacing', () => {
    const ideal = Math.sqrt((4 * Math.PI) / 326); // mean spacing of a uniform layout
    const min = minNeighbourDistance(pos);
    expect(min).toBeGreaterThan(ideal * 0.6);
    expect(orbRadiusFor(pos) * 2).toBeLessThan(min);
  });
  it('is deterministic', () => {
    expect(Array.from(fibonacciSphere(10))).toEqual(Array.from(fibonacciSphere(10)));
  });
});

describe('frustum culling and LOD', () => {
  const pos = fibonacciSphere(HOLO_AGENT_COUNT, 1);
  const planes = extractFrustumPlanes(viewProj(3.6));
  it('keeps a point in front and culls a point behind the camera', () => {
    expect(sphereInFrustum(planes, 0, 0, 0, 0.06)).toBe(true);
    expect(sphereInFrustum(planes, 0, 0, 10, 0.06)).toBe(false);
    expect(sphereInFrustum(planes, 50, 0, 0, 0.06)).toBe(false);
  });
  it('culls orbs when zoomed in tight, none when the whole sphere is in view', () => {
    const idx = new Uint16Array(326), lod = new Uint8Array(326);
    const far = cullAndLod(pos, planes, { x: 0, y: 0, z: 3.6 }, 0.06, { near: 3.7, mid: 4.3 }, idx, lod);
    expect(far.count).toBe(326);
    const tight = cullAndLod(pos, extractFrustumPlanes(viewProj(1.4, 45)), { x: 0, y: 0, z: 1.4 }, 0.06, { near: 1.5, mid: 2.1 }, idx, lod);
    expect(tight.count).toBeLessThan(326);
    expect(tight.count + tight.culled).toBe(326);
  });
  it('culls roughly the far hemisphere when the globe occludes it', () => {
    const idx = new Uint16Array(326), lod = new Uint8Array(326);
    const r = cullAndLod(pos, planes, { x: 0, y: 0, z: 3.6 }, 0.06, { near: 2.95, mid: 3.3 }, idx, lod, 1 / 3.6 - 0.12);
    expect(r.count).toBeGreaterThan(130);
    expect(r.count).toBeLessThan(200);
    for (let k = 0; k < r.count; k++) expect(pos[idx[k] * 3 + 2]).toBeGreaterThan(0.1);
  });
  it('assigns all three LOD levels across the sphere at the default view', () => {
    const idx = new Uint16Array(326), lod = new Uint8Array(326);
    const r = cullAndLod(pos, planes, { x: 0, y: 0, z: 3.6 }, 0.06, { near: 2.95, mid: 3.3 }, idx, lod, 1 / 3.6 - 0.12);
    const seen = new Set(Array.from(lod.subarray(0, r.count)));
    expect(seen.has(0) && seen.has(1) && seen.has(2)).toBe(true);
  });
  it('lod helpers', () => {
    expect(lodForDistance(1, { near: 2, mid: 4 })).toBe(0);
    expect(lodForDistance(3, { near: 2, mid: 4 })).toBe(1);
    expect(lodForDistance(5, { near: 2, mid: 4 })).toBe(2);
    expect(lodForScreenSize(30)).toBe(0);
    expect(lodForScreenSize(8)).toBe(1);
    expect(lodForScreenSize(2)).toBe(2);
  });
});

describe('fps meter', () => {
  it('reports sustained 60 only when p95 fits the frame budget', () => {
    const m = new FpsMeter(120);
    for (let i = 0; i < 120; i++) m.push(FRAME_BUDGET_MS);
    expect(fpsVerdict(m.snapshot())).toBe('sustained');
    const slow = new FpsMeter(120);
    for (let i = 0; i < 120; i++) slow.push(i % 4 === 0 ? 40 : 16);
    expect(fpsVerdict(slow.snapshot())).toBe('below_target');
  });
  it('says measuring until it has enough samples', () => {
    const m = new FpsMeter(120);
    m.push(16);
    expect(fpsVerdict(m.snapshot())).toBe('measuring');
  });
});

describe('design tokens', () => {
  it('converts an HSL token triplet to rgb', () => {
    const [r, g, b] = hslTripletToRgb('0 100% 50%');
    expect(r).toBeCloseTo(1); expect(g).toBeCloseTo(0); expect(b).toBeCloseTo(0);
  });
  it('every orb state has a label and a token, and approval uses amber', () => {
    for (const s of HOLO_ORB_STATES) {
      expect(HOLO_STATE_LABELS[s].length).toBeGreaterThan(0);
      expect(HOLO_STATE_TOKENS[s].startsWith('--')).toBe(true);
    }
    expect(HOLO_STATE_TOKENS.awaiting_approval).toBe('--pending-amber');
    expect(HOLO_STATE_LABELS.awaiting_approval).toBe('Awaiting approval');
  });
  it('amber is used for nothing but pending approvals in the orb palette', () => {
    const amberUsers = HOLO_ORB_STATES.filter((s) => HOLO_STATE_TOKENS[s] === '--pending-amber');
    expect(amberUsers).toEqual(['awaiting_approval']);
  });
  it('fixture produces 326 agents and counts add up', () => {
    const a = fixtureAgents();
    expect(a.length).toBe(326);
    expect(Object.values(countByState(a)).reduce((x, y) => x + y, 0)).toBe(326);
  });
});

describe('source rules', () => {
  const root = path.resolve(__dirname, '../..');
  const files = [
    'components/holo/holo-surface.tsx', 'components/holo/holo-orb-field.tsx', 'components/holo/fps-monitor.tsx',
    'components/avatar/avatar-canvas.tsx', 'components/avatar/whink-avatar.tsx', 'components/avatar/mamba-avatar.tsx',
    'components/neural-link/approval-dock.tsx', 'components/neural-link/security-event-display.tsx',
  ];
  it('has no hex colour in any new component', () => {
    for (const f of files) expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/);
  });
  it('has no hard coded product name in markup', () => {
    for (const f of files) expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/\b(WHINK|MAMBA)\b/);
  });
  it('keeps each avatar under the 2 MB budget', () => {
    for (const f of ['public/avatar/whink-portrait.webp', 'public/avatar/mamba-portrait.webp']) {
      expect(statSync(path.join(root, f)).size).toBeLessThan(2 * 1024 * 1024);
    }
  });
});
