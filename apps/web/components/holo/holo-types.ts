// Shared orb vocabulary. Pure data, no DOM, safe for SSR and tests.

export const HOLO_AGENT_COUNT = 326;

/** Index order is the GPU contract: it indexes the colour table and the icon atlas. */
export const HOLO_ORB_STATES = [
  'idle',
  'working',
  'thinking',
  'awaiting_approval',
  'blocked',
  'offline',
] as const;

export type HoloOrbState = (typeof HOLO_ORB_STATES)[number];

/** Text labels. Colour never carries state alone, so every state also has a label and an icon. */
export const HOLO_STATE_LABELS: Record<HoloOrbState, string> = {
  idle: 'Idle',
  working: 'Working',
  thinking: 'Thinking',
  awaiting_approval: 'Awaiting approval',
  blocked: 'Blocked',
  offline: 'Offline',
};

/** CSS custom property (an "H S% L%" triplet) used for each state. Tokens only. */
export const HOLO_STATE_TOKENS: Record<HoloOrbState, string> = {
  idle: '--muted-foreground',
  working: '--whink-accent',
  thinking: '--primary',
  awaiting_approval: '--pending-amber',
  blocked: '--denial',
  offline: '--border',
};

export interface HoloAgent {
  id: string;
  name: string;
  state: HoloOrbState;
}

export function stateIndex(state: HoloOrbState): number {
  return HOLO_ORB_STATES.indexOf(state);
}

export function countByState(agents: readonly HoloAgent[]): Record<HoloOrbState, number> {
  const out = { idle: 0, working: 0, thinking: 0, awaiting_approval: 0, blocked: 0, offline: 0 } as Record<HoloOrbState, number>;
  for (const a of agents) out[a.state] += 1;
  return out;
}
