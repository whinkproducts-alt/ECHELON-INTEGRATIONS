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

/** Validate untrusted task fields. Returns an error string or the cleaned values. Unknown fields are ignored. */
export function validateTaskInput(
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
