// DEV FIXTURE. Sample agents for the HOLO screen until the agent registry has an API.
// Never shown as real data: the screen labels it "Sample data".
import { HOLO_AGENT_COUNT, HOLO_ORB_STATES, type HoloAgent, type HoloOrbState } from './holo-types';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

const WEIGHTS: Array<[HoloOrbState, number]> = [
  ['idle', 0.42], ['working', 0.24], ['thinking', 0.14], ['awaiting_approval', 0.04], ['blocked', 0.03], ['offline', 0.13],
];

function pick(r: number): HoloOrbState {
  let acc = 0;
  for (const [s, w] of WEIGHTS) { acc += w; if (r < acc) return s; }
  return HOLO_ORB_STATES[0];
}

export function fixtureAgents(n = HOLO_AGENT_COUNT, seed = 7): HoloAgent[] {
  const r = lcg(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `agent-${String(i + 1).padStart(3, '0')}`,
    name: `Agent ${String(i + 1).padStart(3, '0')}`,
    state: pick(r()),
  }));
}

/** Returns a copy with `changes` agents moved to a new state. Deterministic for a given seed. */
export function fixtureTick(agents: readonly HoloAgent[], seed: number, changes = 6): HoloAgent[] {
  const r = lcg(seed);
  const next = agents.slice();
  if (next.length === 0) return next;
  for (let k = 0; k < changes; k++) {
    const i = Math.floor(r() * next.length);
    next[i] = { ...next[i], state: pick(r()) };
  }
  return next;
}
