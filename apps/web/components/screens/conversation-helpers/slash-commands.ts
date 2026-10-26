// Pure helpers for the conversation surface: slash command menu, starter prompts,
// ?prompt= handling and the Options disclosure flag. No React, no DOM, easy to test.
//
// Behaviour of each command is taken from lib/orchestrator.ts:
//  - /whink and /mamba switch the active persona (MAMBA is Obsidian only).
//  - /brief /deep /plan /status set a response style (functional mode) that stays on
//    until another style command replaces it. Switching minds or styles never changes permissions.

export interface SlashCommand {
  name: string;
  /** Plain one-line description. Product and mind names come from the labels argument. */
  describe: (labels: CommandLabels) => string;
}

export interface CommandLabels {
  productName: string;
  /** Tenant label for the adversarial mind; null falls back to neutral wording. */
  opponentLabel: string | null;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: 'whink', describe: (l) => `Switch back to ${l.productName}, your main assistant.` },
  { name: 'mamba', describe: (l) => `Switch to ${l.opponentLabel ?? 'the opponent mind'}, which argues the other side so you see hard moves coming.` },
  { name: 'brief', describe: () => 'Short, direct answers with no padding. Stays on until you pick another style.' },
  { name: 'deep', describe: () => 'Thorough analysis from several angles, including second-order effects.' },
  { name: 'plan', describe: () => 'Break a goal into steps with dependencies, risks and blockers.' },
  { name: 'status', describe: () => 'Report as completed, in progress, blocked, waiting and next.' },
];

/** The token being typed: input must start with '/' and contain no whitespace yet. */
export function slashToken(input: string): string | null {
  if (!input.startsWith('/') || /\s/.test(input)) return null;
  return input.slice(1).toLowerCase();
}

export function filterCommands(input: string): SlashCommand[] {
  const token = slashToken(input);
  if (token === null) return [];
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(token));
}

/** Menu is open while a command is being typed and it has not been typed out in full. */
export function isSlashMenuOpen(input: string): boolean {
  const list = filterCommands(input);
  if (list.length === 0) return false;
  const token = slashToken(input);
  return !(list.length === 1 && list[0].name === token);
}

export function commandInsertText(c: SlashCommand): string {
  return `/${c.name} `;
}

export function moveIndex(current: number, delta: 1 | -1, length: number): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}

export type MenuKeyResult =
  | { kind: 'move'; index: number }
  | { kind: 'select'; index: number }
  | { kind: 'dismiss' }
  | { kind: 'none' };

/** Maps a key press to a menu action. Enter and Tab select; anything else passes through. */
export function handleMenuKey(key: string, index: number, length: number): MenuKeyResult {
  if (length <= 0) return { kind: 'none' };
  switch (key) {
    case 'ArrowDown': return { kind: 'move', index: moveIndex(index, 1, length) };
    case 'ArrowUp': return { kind: 'move', index: moveIndex(index, -1, length) };
    case 'Enter':
    case 'Tab': return { kind: 'select', index };
    case 'Escape': return { kind: 'dismiss' };
    default: return { kind: 'none' };
  }
}

export interface StarterRequest { id: string; label: string; prompt: string }

export function starterRequests(opponentLabel: string | null): StarterRequest[] {
  const who = opponentLabel ?? 'an opponent';
  return [
    { id: 'brief', label: 'Brief me on what needs my attention', prompt: 'Brief me on what needs my attention' },
    { id: 'plan', label: 'Draft a plan for a new project', prompt: 'Draft a plan for a new project' },
    { id: 'recall', label: 'What did we decide last week?', prompt: 'What did we decide last week?' },
    { id: 'review', label: `Review this idea like ${who} would`, prompt: `Review this idea like ${who} would: ` },
  ];
}

export const PROMPT_PARAM_MAX = 280;

/** Reads a ?prompt= value as plain text only: first value, control characters removed, capped. */
export function sanitizePromptParam(raw: string | string[] | undefined | null): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ').trim().slice(0, PROMPT_PARAM_MAX);
}

export function promptHref(prompt: string): string {
  return `/dashboard/conversation?prompt=${encodeURIComponent(prompt.slice(0, PROMPT_PARAM_MAX))}`;
}

export const OPTIONS_FLAG_KEY = 'whink-options-used';

interface FlagStore { getItem(k: string): string | null; setItem(k: string, v: string): void }

function store(): FlagStore | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function readOptionsFlag(s: FlagStore | null = store()): boolean {
  try { return s?.getItem(OPTIONS_FLAG_KEY) === 'true'; } catch { return false; }
}

export function writeOptionsFlag(s: FlagStore | null = store()): void {
  try { s?.setItem(OPTIONS_FLAG_KEY, 'true'); } catch { /* storage unavailable */ }
}
