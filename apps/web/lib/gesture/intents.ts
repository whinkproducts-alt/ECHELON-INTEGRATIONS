/**
 * Gesture to intent table. Code, not data: no request, tenant setting or model can change it.
 *
 * No gesture is Class C and none can decide an approval. Approvals name a request id
 * (CLAUDE.md 2b/B2); a hand shape cannot. "point" only PROPOSES a task: it creates an
 * execution authorization request that waits for the approval card, like any other.
 *
 * Thresholds are on the 300 point scale. Until a learned encoder is registered the best
 * reachable score is 250, so work creating gestures need 200 (80% of reachable) and UI
 * state gestures need 170.
 */

import type { GestureType } from './types';

export type IntentName =
  | 'open_thread'
  | 'request_brief'
  | 'propose_task'
  | 'select'
  | 'dismiss'
  | 'toggle_overview'
  | 'pause'
  | 'wake'
  | 'next'
  | 'refresh';

export interface IntentDef {
  intent: IntentName;
  /** Capability name checked by the permission engine and written to the ledger. */
  capability: string;
  permissionClass: 'A' | 'B';
  minConfidence: number;
}

export const MIN_ACT = 200;
export const MIN_UI = 170;

export const INTENTS: Readonly<Record<GestureType, Readonly<IntentDef>>> = Object.freeze({
  pinch: Object.freeze({ intent: 'open_thread', capability: 'gesture_open_thread', permissionClass: 'A', minConfidence: MIN_ACT }),
  // Speaks aloud, so it needs delegation or autonomy 2, like the SMS briefing.
  crush: Object.freeze({ intent: 'request_brief', capability: 'gesture_request_brief', permissionClass: 'B', minConfidence: MIN_ACT }),
  // Proposal only. Starting the work is Class C and waits for the approval card.
  point: Object.freeze({ intent: 'propose_task', capability: 'gesture_propose_task', permissionClass: 'A', minConfidence: MIN_ACT }),
  thumbs_up: Object.freeze({ intent: 'select', capability: 'gesture_select', permissionClass: 'A', minConfidence: MIN_UI }),
  thumbs_down: Object.freeze({ intent: 'dismiss', capability: 'gesture_dismiss', permissionClass: 'A', minConfidence: MIN_UI }),
  peace: Object.freeze({ intent: 'toggle_overview', capability: 'gesture_toggle_overview', permissionClass: 'A', minConfidence: MIN_UI }),
  palm: Object.freeze({ intent: 'pause', capability: 'gesture_pause', permissionClass: 'A', minConfidence: MIN_UI }),
  wave: Object.freeze({ intent: 'wake', capability: 'gesture_wake', permissionClass: 'A', minConfidence: MIN_UI }),
  flick: Object.freeze({ intent: 'next', capability: 'gesture_next', permissionClass: 'A', minConfidence: MIN_UI }),
  circle: Object.freeze({ intent: 'refresh', capability: 'gesture_refresh', permissionClass: 'A', minConfidence: MIN_UI }),
});
