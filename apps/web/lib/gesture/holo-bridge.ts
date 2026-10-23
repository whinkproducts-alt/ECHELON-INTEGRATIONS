/**
 * HOLO state bridge. Server side source of truth for the spatial UI state of one user,
 * plus a per-user event bus the SSE stream reads from.
 *
 * The reducer is pure. State holds ids and enums only, never task text, so nothing from
 * an external system crosses this boundary. In memory: one server process. A multi
 * instance deployment needs a shared store behind the same interface.
 */

import type { GestureType } from './types';
import type { IntentName } from './intents';

export type HoloMode = 'idle' | 'active' | 'paused' | 'overview' | 'thread_select';

export interface HoloState {
  version: number;
  mode: HoloMode;
  openTaskId: string | null;
  focusedAgentId: string | null;
  focusIndex: number;
  pendingApprovalId: string | null;
  briefRequestedAt: number | null;
  refreshedAt: number | null;
  lastGesture: { type: GestureType; at: number } | null;
}

export type HoloAction =
  | { intent: 'open_thread'; taskId: string | null }
  | { intent: 'request_brief' }
  | { intent: 'propose_task'; approvalId: string }
  | { intent: 'select'; agentId: string | null }
  | { intent: 'dismiss' }
  | { intent: 'toggle_overview' }
  | { intent: 'pause' }
  | { intent: 'wake' }
  | { intent: 'next'; step: 1 | -1 }
  | { intent: 'refresh' };

export type HoloEvent =
  | { type: 'snapshot'; state: HoloState }
  | { type: 'state'; state: HoloState }
  | {
      type: 'gesture';
      gesture: GestureType;
      intent: IntentName;
      status: string;
      confidence: number;
      correlationId: string;
      at: number;
    };

export function initialState(): HoloState {
  return {
    version: 0, mode: 'idle', openTaskId: null, focusedAgentId: null, focusIndex: 0,
    pendingApprovalId: null, briefRequestedAt: null, refreshedAt: null, lastGesture: null,
  };
}

export function reduce(s: HoloState, a: HoloAction, gesture: GestureType, now: number): HoloState {
  const n: HoloState = { ...s, version: s.version + 1, lastGesture: { type: gesture, at: now } };
  switch (a.intent) {
    case 'open_thread':
      n.openTaskId = a.taskId;
      n.mode = a.taskId ? 'active' : 'thread_select';
      n.focusedAgentId = null;
      break;
    case 'request_brief':
      n.briefRequestedAt = now;
      break;
    case 'propose_task':
      n.pendingApprovalId = a.approvalId;
      break;
    case 'select':
      if (a.agentId) n.focusedAgentId = a.agentId;
      break;
    case 'dismiss':
      n.openTaskId = null;
      n.focusedAgentId = null;
      n.mode = 'active';
      break;
    case 'toggle_overview':
      n.mode = s.mode === 'overview' ? 'active' : 'overview';
      break;
    case 'pause':
      n.mode = 'paused';
      break;
    case 'wake':
      n.mode = s.mode === 'paused' || s.mode === 'idle' ? 'active' : s.mode;
      break;
    case 'next':
      n.focusIndex = Math.max(0, s.focusIndex + a.step);
      break;
    case 'refresh':
      n.refreshedAt = now;
      break;
  }
  return n;
}

type Listener = (e: HoloEvent) => void;
const MAX_LISTENERS_PER_USER = 5;
const MAX_USERS = 1000;
const IDLE_MS = 6 * 60 * 60 * 1000;

export class HoloBridge {
  private states = new Map<string, { state: HoloState; touched: number }>();
  private listeners = new Map<string, Set<Listener>>();

  getState(userId: string): HoloState {
    return this.states.get(userId)?.state ?? initialState();
  }

  apply(userId: string, action: HoloAction, gesture: GestureType, now: number = Date.now()): HoloState {
    const next = reduce(this.getState(userId), action, gesture, now);
    this.states.set(userId, { state: next, touched: now });
    if (this.states.size > MAX_USERS) this.evict(now);
    this.publish(userId, { type: 'state', state: next });
    return next;
  }

  publish(userId: string, event: HoloEvent): void {
    for (const fn of this.listeners.get(userId) ?? []) {
      try { fn(event); } catch { /* a broken listener must not stop the others */ }
    }
  }

  /** Returns an unsubscribe function, or null when the per user cap is reached. */
  subscribe(userId: string, fn: Listener): (() => void) | null {
    let set = this.listeners.get(userId);
    if (!set) this.listeners.set(userId, (set = new Set()));
    if (set.size >= MAX_LISTENERS_PER_USER) return null;
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.listeners.delete(userId);
    };
  }

  private evict(now: number): void {
    for (const [u, v] of this.states) if (now - v.touched > IDLE_MS && !this.listeners.has(u)) this.states.delete(u);
  }

  _resetForTest(): void {
    this.states.clear();
    this.listeners.clear();
  }
}

const g = globalThis as unknown as { __holoBridge?: HoloBridge };
export const holoBridge: HoloBridge = (g.__holoBridge ??= new HoloBridge());
