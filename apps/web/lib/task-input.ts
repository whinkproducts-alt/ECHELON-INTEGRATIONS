export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;
export const MAX_TASK_TITLE = 300;
export const MAX_TASK_DESCRIPTION = 4000;
export const MAX_TASK_ASSIGNEE = 120;

export interface ValidTaskInput {
  title: string;
  description: string | null;
  priority: (typeof TASK_PRIORITIES)[number];
  dueDate: Date | null;
  status?: (typeof TASK_STATUSES)[number];
  assignee: string | null;
}

export type TaskPatch = Partial<ValidTaskInput>;

/**
 * Validate untrusted task fields. Returns an error string or the cleaned values. Unknown fields are ignored.
 * With `partial: true` only supplied fields are validated and returned (title may be omitted).
 */
export function validateTaskInput(
  raw: Record<string, unknown>,
  opts: { allowAssignee: boolean; allowStatus: boolean; partial: true }
): { error: string } | { value: TaskPatch };
export function validateTaskInput(
  raw: Record<string, unknown>,
  opts: { allowAssignee: boolean; allowStatus: boolean; partial?: false }
): { error: string } | { value: ValidTaskInput };
export function validateTaskInput(
  raw: Record<string, unknown>,
  opts: { allowAssignee: boolean; allowStatus: boolean; partial?: boolean }
): { error: string } | { value: ValidTaskInput | TaskPatch } {
  if (opts.partial) return validatePartial(raw, opts);
  return validateFull(raw, opts);
}

function validatePartial(
  raw: Record<string, unknown>,
  opts: { allowAssignee: boolean; allowStatus: boolean }
): { error: string } | { value: TaskPatch } {
  const has = (k: string) => raw[k] !== undefined;
  // null is not a legal value for title, priority or status in a patch.
  for (const k of ['title', 'priority', 'status']) {
    if (raw[k] === null) return { error: `${k} cannot be null` };
  }
  const probe = validateFull(
    { ...raw, title: has('title') ? raw.title : 'x', status: opts.allowStatus ? raw.status : undefined },
    opts
  );
  if ('error' in probe) return probe;
  const v = probe.value;
  const out: TaskPatch = {};
  if (has('title')) out.title = v.title;
  if (has('description')) out.description = v.description;
  if (has('priority')) out.priority = v.priority;
  if (has('dueDate')) out.dueDate = v.dueDate;
  if (opts.allowStatus && has('status')) out.status = v.status;
  if (opts.allowAssignee && has('assignee')) out.assignee = v.assignee;
  if (Object.keys(out).length === 0) return { error: 'no valid fields to update' };
  return { value: out };
}

function validateFull(
  raw: Record<string, unknown>,
  opts: { allowAssignee: boolean; allowStatus: boolean }
): { error: string } | { value: ValidTaskInput } {
  if (typeof raw.title !== 'string') return { error: 'title must be a string' };
  const title = raw.title.trim();
  if (!title) return { error: 'title required' };
  if (title.length > MAX_TASK_TITLE) return { error: `title too long (max ${MAX_TASK_TITLE})` };

  let description: string | null = null;
  if (raw.description !== undefined && raw.description !== null) {
    if (typeof raw.description !== 'string') return { error: 'description must be a string' };
    if (raw.description.length > MAX_TASK_DESCRIPTION) return { error: 'description too long' };
    description = raw.description;
  }

  let priority: ValidTaskInput['priority'] = 'MEDIUM';
  if (raw.priority !== undefined && raw.priority !== null) {
    if (typeof raw.priority !== 'string' || !(TASK_PRIORITIES as readonly string[]).includes(raw.priority)) {
      return { error: 'invalid priority' };
    }
    priority = raw.priority as ValidTaskInput['priority'];
  }

  let dueDate: Date | null = null;
  if (raw.dueDate !== undefined && raw.dueDate !== null && raw.dueDate !== '') {
    if (typeof raw.dueDate !== 'string') return { error: 'invalid dueDate' };
    const d = new Date(raw.dueDate);
    if (Number.isNaN(d.getTime())) return { error: 'invalid dueDate' };
    dueDate = d;
  }

  let status: ValidTaskInput['status'];
  if (opts.allowStatus && raw.status !== undefined && raw.status !== null) {
    if (typeof raw.status !== 'string' || !(TASK_STATUSES as readonly string[]).includes(raw.status)) {
      return { error: 'invalid status' };
    }
    status = raw.status as ValidTaskInput['status'];
  }

  let assignee: string | null = null;
  if (opts.allowAssignee && raw.assignee !== undefined && raw.assignee !== null) {
    if (typeof raw.assignee !== 'string') return { error: 'assignee must be a string' };
    assignee = raw.assignee.slice(0, MAX_TASK_ASSIGNEE);
  }

  return { value: { title, description, priority, dueDate, status, assignee } };
}
