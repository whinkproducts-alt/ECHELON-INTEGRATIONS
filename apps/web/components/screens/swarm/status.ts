import type { HoloTone } from '@/components/ui/holo';
import type { RunStatus, TaskStatus } from './types';

export const RUN_STATUS: Record<RunStatus, { label: string; tone: HoloTone; pulse: boolean }> = {
  PLANNED: { label: 'Awaiting your start', tone: 'amber', pulse: true },
  RUNNING: { label: 'Running', tone: 'accent', pulse: true },
  FINALIZING: { label: 'Writing the final report', tone: 'accent', pulse: true },
  DONE: { label: 'Done', tone: 'deep', pulse: false },
  FAILED: { label: 'Failed', tone: 'ember', pulse: false },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', pulse: false },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: HoloTone; pulse: boolean }> = {
  PENDING: { label: 'Pending', tone: 'neutral', pulse: false },
  RUNNING: { label: 'Running', tone: 'accent', pulse: true },
  DONE: { label: 'Done', tone: 'deep', pulse: false },
  FAILED: { label: 'Failed', tone: 'ember', pulse: false },
  SKIPPED: { label: 'Skipped', tone: 'neutral', pulse: false },
};

export const STOP_TEXT: Record<string, string> = {
  token_cap: 'Stopped at the token cap for this run.',
  cancelled: 'Cancelled by you.',
};
