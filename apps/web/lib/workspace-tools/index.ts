/**
 * Read-only workspace tools for a local agent. The model never executes anything: it names a
 * tool with structured arguments, WHINK validates, runs the fixed implementation and returns the
 * result as untrusted external content.
 *
 * Offered and executable only when WHINK_LOCAL_AGENT_TOOLS === 'true' AND WHINK_WORKSPACE_ROOT is
 * an absolute path to an existing directory (see workspaceStatus). This stage is READ ONLY:
 * there is no patch, test-run, commit, push, delete, network or messaging tool, and those names
 * stay unregistered so the unknown-tool path denies and ledgers them.
 *
 * This module must not import tool-registry (it is imported by it).
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '@/lib/tool-loop';
import { LIMITS, listFilesTool, readFileTool, searchFilesTool } from '@/lib/workspace-tools/fs-tools';
import { GIT_LIMITS, gitDiffTool, gitLogTool, gitStatusTool } from '@/lib/workspace-tools/git';
import { SandboxError, resolveRoot } from '@/lib/workspace-tools/sandbox';

export const WORKSPACE_TOOL_NAMES = ['get_cwd', 'read_file', 'list_files', 'search_files', 'git_status', 'git_diff', 'git_log'] as const;
export type WorkspaceToolName = (typeof WORKSPACE_TOOL_NAMES)[number];

/** Permission-engine capability for each tool (all Class A, see CAPABILITY_CLASSES). */
export const WORKSPACE_CAPABILITIES: Readonly<Record<WorkspaceToolName, string>> = Object.freeze({
  get_cwd: 'workspace_get_cwd',
  read_file: 'workspace_read_file',
  list_files: 'workspace_list_files',
  search_files: 'workspace_search_files',
  git_status: 'workspace_git_status',
  git_diff: 'workspace_git_diff',
  git_log: 'workspace_git_log',
});

export function isWorkspaceTool(name: string): name is WorkspaceToolName {
  return Object.prototype.hasOwnProperty.call(WORKSPACE_CAPABILITIES, name);
}

export type WorkspaceStatus = { enabled: true; root: string } | { enabled: false; reason: 'flag_off' | 'root_unset' | 'root_invalid' };

export function workspaceStatus(env: NodeJS.ProcessEnv = process.env): WorkspaceStatus {
  if (env.WHINK_LOCAL_AGENT_TOOLS !== 'true') return { enabled: false, reason: 'flag_off' };
  const root = env.WHINK_WORKSPACE_ROOT;
  if (!root || !root.trim()) return { enabled: false, reason: 'root_unset' };
  try {
    if (!path.isAbsolute(root) || root.includes('\0') || !fs.statSync(root).isDirectory()) return { enabled: false, reason: 'root_invalid' };
  } catch {
    return { enabled: false, reason: 'root_invalid' };
  }
  return { enabled: true, root };
}

// ── definitions (plain descriptions, strict schemas) ──────────────────────────

const pathProp = { type: 'string', minLength: 1, maxLength: 1024, description: 'Path relative to the workspace root' };

export const WORKSPACE_TOOL_DEFS: readonly ToolDefinition[] = Object.freeze([
  {
    name: 'get_cwd',
    description: 'Return the workspace root directory.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_file',
    description: 'Read a text file in the workspace. Returns at most 64 KB.',
    inputSchema: {
      type: 'object',
      properties: {
        path: pathProp,
        start_line: { type: 'integer', minimum: 1, maximum: 1000000, description: 'First line to return (1 based)' },
        line_count: { type: 'integer', minimum: 1, maximum: LIMITS.readMaxLines, description: 'Number of lines to return' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_files',
    description: 'List files and folders in a workspace directory. Up to 500 entries.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { ...pathProp, description: 'Directory relative to the workspace root (default: the root)' },
        depth: { type: 'integer', minimum: 1, maximum: LIMITS.listMaxDepth, description: 'How many levels to list (default 1)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_files',
    description: 'Find lines containing a text in workspace files. Plain text only. Up to 100 matches.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', minLength: 1, maxLength: LIMITS.searchMaxPatternLength, description: 'Text to find' },
        path: { ...pathProp, description: 'File or directory to search (default: the root)' },
        ignore_case: { type: 'boolean' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    name: 'git_status',
    description: 'Show the git branch and changed files of the workspace.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'git_diff',
    description: 'Show uncommitted changes in the workspace: a summary, or the full patch.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { ...pathProp, description: 'Limit the diff to one path' },
        patch: { type: 'boolean', description: 'Return the full patch instead of a summary' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'git_log',
    description: 'Show recent git commits, one line each.',
    inputSchema: {
      type: 'object',
      properties: { n: { type: 'integer', minimum: 1, maximum: GIT_LIMITS.logMax, description: 'Number of commits (default 10)' } },
      additionalProperties: false,
    },
  },
] as ToolDefinition[]);

/** Definitions to offer a model: empty unless the registration conditions hold. */
export function workspaceToolDefinitions(env: NodeJS.ProcessEnv = process.env): ToolDefinition[] {
  return workspaceStatus(env).enabled ? WORKSPACE_TOOL_DEFS.map((d) => ({ ...d })) : [];
}

// ── validation ────────────────────────────────────────────────────────────────

const relPath = z.string().min(1).max(1024);
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const SCHEMAS: Record<WorkspaceToolName, z.ZodType<Record<string, unknown>>> = {
  get_cwd: z.object({}).strict(),
  read_file: z.object({ path: relPath, start_line: int(1, 1_000_000).optional(), line_count: int(1, LIMITS.readMaxLines).optional() }).strict(),
  list_files: z.object({ path: relPath.optional(), depth: int(1, LIMITS.listMaxDepth).optional() }).strict(),
  search_files: z.object({ pattern: z.string().min(1).max(LIMITS.searchMaxPatternLength), path: relPath.optional(), ignore_case: z.boolean().optional() }).strict(),
  git_status: z.object({}).strict(),
  git_diff: z.object({ path: relPath.optional(), patch: z.boolean().optional() }).strict(),
  git_log: z.object({ n: int(1, GIT_LIMITS.logMax).optional() }).strict(),
};

export interface WorkspaceResult { success: boolean; data?: unknown; error?: string }

/** Most characters one tool result may add to the model context (a small local model has a small window). */
export function toolResultMaxChars(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.WHINK_TOOL_RESULT_MAX_CHARS);
  return Number.isFinite(n) && n >= 500 ? Math.floor(n) : 16000;
}

/**
 * Bound a successful result to toolResultMaxChars. Text fields are cut and list fields lose their tail;
 * the result says it was truncated and how to get the rest.
 */
export function capToolResult(name: string, data: unknown, max: number = toolResultMaxChars()): unknown {
  if (!data || typeof data !== 'object') return data;
  const d = { ...(data as Record<string, any>) };
  if (JSON.stringify(d).length <= max) return d;
  const hint = name === 'read_file'
    ? `Result cut at about ${max} characters. Read the rest with start_line and line_count.`
    : `Result cut at about ${max} characters. Narrow it with a more specific path or pattern.`;
  d.truncated = true;
  d.hint = hint;
  for (const field of ['content', 'output'] as const) {
    if (typeof d[field] === 'string') {
      const room = Math.max(200, max - (JSON.stringify({ ...d, [field]: '' }).length));
      d[field] = (d[field] as string).slice(0, room);
      if (field === 'content' && typeof d.start_line === 'number') {
        d.end_line = d.start_line + (d.content === '' ? 0 : d.content.split('\n').length) - 1;
      }
    }
  }
  for (const field of ['entries', 'matches'] as const) {
    if (Array.isArray(d[field])) {
      const arr = [...d[field]];
      while (arr.length > 1 && JSON.stringify({ ...d, [field]: arr }).length > max) arr.pop();
      d[field] = arr;
    }
  }
  return d;
}

/** Run one workspace tool. Never throws. Caller has already passed the permission engine. */
export async function runWorkspaceTool(name: string, params: unknown): Promise<WorkspaceResult> {
  if (!isWorkspaceTool(name)) return { success: false, error: 'not a workspace tool' };
  const status = workspaceStatus();
  if (!status.enabled) return { success: false, error: 'not configured' };
  const parsed = SCHEMAS[name].safeParse(params ?? {});
  if (!parsed.success) return { success: false, error: `invalid arguments: ${parsed.error.issues.map((i) => i.path.join('.') || 'arguments').slice(0, 3).join(', ')}` };
  const a = parsed.data as any;
  try {
    const root = await resolveRoot(status.root);
    switch (name) {
      case 'get_cwd': return { success: true, data: { cwd: root } };
      case 'read_file': return { success: true, data: capToolResult(name, await readFileTool(root, a)) };
      case 'list_files': return { success: true, data: capToolResult(name, await listFilesTool(root, a)) };
      case 'search_files': return { success: true, data: capToolResult(name, await searchFilesTool(root, a)) };
      case 'git_status': return gitResult(name, await gitStatusTool(root));
      case 'git_diff': return gitResult(name, await gitDiffTool(root, a));
      case 'git_log': return gitResult(name, await gitLogTool(root, a));
    }
  } catch (e) {
    if (e instanceof SandboxError) return { success: false, error: e.message };
    return { success: false, error: 'workspace tool failed' };
  }
}

function gitResult(name: string, r: { ok: boolean; output: string; truncated: boolean; error?: string }): WorkspaceResult {
  return r.ok ? { success: true, data: capToolResult(name, { output: r.output, truncated: r.truncated }) } : { success: false, error: r.error ?? 'git failed' };
}

// ── ledger summaries: names, paths, counts and sizes only. Never contents. ────

/** Relative path or pattern, capped. Never file, diff or match text. */
export function summariseWorkspaceInput(name: string, params: unknown): string {
  const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, '?').slice(0, 120) : '');
  const bits: string[] = [name];
  if (typeof p.path === 'string') bits.push(`path=${s(p.path)}`);
  // The raw pattern may hold anything the model was shown: record only its length and a short hash.
  if (typeof p.pattern === 'string') bits.push(`pattern_len=${p.pattern.length}`, `pattern_sha=${createHash('sha256').update(p.pattern).digest('hex').slice(0, 8)}`);
  if (p.patch === true) bits.push('patch');
  if (typeof p.n === 'number') bits.push(`n=${p.n}`);
  return bits.join(' ').slice(0, 300);
}

export function summariseWorkspaceResult(result: { success: boolean; data?: any; error?: string }): string {
  if (!result.success) return `error: ${String(result.error ?? 'failed').slice(0, 120)}`;
  const d = result.data ?? {};
  const parts: string[] = ['ok'];
  if (Array.isArray(d.entries)) parts.push(`entries=${d.entries.length}`);
  if (Array.isArray(d.matches)) parts.push(`matches=${d.matches.length}`, `files_scanned=${d.files_scanned ?? 0}`);
  if (typeof d.content === 'string') parts.push(`bytes=${Buffer.byteLength(d.content, 'utf8')}`);
  if (typeof d.output === 'string') parts.push(`bytes=${Buffer.byteLength(d.output, 'utf8')}`);
  if (d.truncated === true) parts.push('truncated');
  return parts.join(' ');
}
