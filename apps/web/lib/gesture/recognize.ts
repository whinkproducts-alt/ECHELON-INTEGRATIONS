import { classifyDynamic, classifyStatic } from './classifier';
import { scoreConfidence } from './confidence';
import { lastFrame } from './landmarks';
import type { Frame, Recognition } from './types';

/** Frames in, one recognition (or null) out. Dynamic gestures win over the static pose they contain. */
export function recognize(frames: Frame[]): Recognition | null {
  if (frames.length === 0) return null;
  const dyn = frames.length >= 3 ? classifyDynamic(frames) : null;
  if (dyn) {
    return { gesture: dyn.gesture, confidence: scoreConfidence(frames, dyn), detail: dyn.detail };
  }
  const st = classifyStatic(lastFrame(frames).landmarks);
  if (!st) return null;
  return { gesture: st.gesture, confidence: scoreConfidence(frames, st), detail: {} };
}
