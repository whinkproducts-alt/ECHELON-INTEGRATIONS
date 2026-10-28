/**
 * Auto Memory Extraction — lib/auto-memory.ts
 *
 * Single home for all auto-extraction logic (3b B1).
 * Called as a detached promise after the stream closes — never awaited.
 * Failures never surface to the caller.
 *
 * Hard rules:
 * - No provider SDK imported here. Uses chatOnce from the model router only (B2).
 * - User message and assistant reply are wrapped as untrusted data (B3).
 * - Secret-pattern candidates are dropped before the permission check; no content
 *   in their ledger rows (B6).
 * - Every candidate outcome (written, denied, deduped, dropped, skipped) lands in
 *   lib/ledger.ts (B7).
 * - MAMBA persona → hypothesis store, confidence capped at 0.4; never semantic (B10).
 * - Tainted and injection-blocked turns skip all extraction (B11).
 * - Daily cap enforced before extraction; at most one cap-reached row per user per day (B12).
 */

import { localOnlyModel } from '@/lib/local-only';
import { chatOnce } from '@/lib/model-router';
import { writeMemory } from '@/lib/memory-engine';
import { checkPermission } from '@/lib/permission-engine';
import { recordActionSafe } from '@/lib/ledger';
import { wrapUntrustedContent } from '@/lib/content-isolation';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// ── Public input type ─────────────────────────────────────────────────────────

export interface ExtractAndStoreMemoriesInput {
  userId: string;
  conversationId: string;
  /** Id of the assistant message saved this turn (provenance, B9). */
  messageId?: string;
  userMessage: string;
  assistantReply: string;
  /** Active persona — MAMBA output goes to hypothesis store only (B10). */
  persona: string;
  correlationId: string;
  /** If true, prior external content was read this turn — skip extraction (B11). */
  conversationTainted?: boolean;
  /** If true, the user message was injection-blocked — skip extraction (B11). */
  injectionBlocked?: boolean;
}

// ── Internal ──────────────────────────────────────────────────────────────────

interface RawCandidate {
  type?: string;
  statement: string;
  confidence?: number;
  eventDate?: string | null;
}

// ── B6 — Secret-drop patterns (H3 fix) ───────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  // Natural-language password phrases ("password is X", "my password: X")
  /\b(password|passwd|passcode|pwd|pin|unlock\s*code)\b.{0,30}\S/i,
  // Key/token/secret assignments (strict or natural)
  /(key|token|secret|api[_-]?key)\s{0,3}[:=\s]\s{0,3}[A-Za-z0-9_\-]{16,256}/i,
  // Vendor key prefixes
  /\b(sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|xox[bp]-[A-Za-z0-9\-]{20,}|AIza[A-Za-z0-9_\-]{35})/,
  // JWT (three base64url segments separated by dots)
  /eyJ[A-Za-z0-9_\-]{1,512}\.[A-Za-z0-9_\-]{1,512}\.[A-Za-z0-9_\-]{1,512}/,
  // High-entropy random tokens (24+ alphanum/special chars)
  /[A-Za-z0-9+/]{24,256}={0,2}(?!\w)/,
  // Card numbers — strip separators first (see normalised check below)
  /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/,
  // Amex 4-6-5
  /\b\d{4}[-.\s]?\d{6}[-.\s]?\d{5}\b/,
];

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function isSecret(raw: string): boolean {
  // Fail closed on enormous input rather than scanning it all; windows() bounds the work per pattern.
  if (raw.length > CLASSIFY_WINDOW * 64) return true;
  return windows(raw).some(isSecretWindow);
}

function isSecretWindow(raw: string): boolean {
  // NFKC normalise and strip zero-width / format characters before matching
  const statement = raw.normalize('NFKC').replace(/[­​-‏‪-‮﻿]/g, '');

  if (SECRET_PATTERNS.some((p) => p.test(statement))) return true;

  // Card number check: strip separators and run Luhn on 13-19 digit sequences
  const stripped = statement.replace(/[-.\s]/g, '');
  const cardCandidates = stripped.match(/\d{13,19}/g) ?? [];
  for (const c of cardCandidates) {
    if (luhn(c)) return true;
  }
  return false;
}

// ── B4/B5 — Sensitivity classification ───────────────────────────────────────

const SENSITIVE_PATTERNS: RegExp[] = [
  // Health / medical (broadened — H2 fix)
  /\b(health|medical|diagnosis|medication|doctor|hospital|surgery|illness|disease|mental\s*health|therap(?:y|ist|ies)|cancer|diabetes|prescription|treatment|symptom|chronic\s+condition|ADHD|autism|depression|anxiety|dementia|schizophrenia|bipolar|drug|adderall|ritalin|prozac|antidepressant|antipsychotic|HIV|AIDS|disorder|syndrome|pregnant|pregnancy|disability|rehab|addiction)\b/i,
  // Financial (word-bounded to avoid "balance sheet")
  /(\$[\d,]+(?:\.\d{2})?|\b\d{5,15}\s{0,3}(?:dollars?|usd|cad)\b|\baccount\s*number\b|\brouting\s*number\b|\bsalary\b|\bincome\b|\bearns?\b|\bowes?\b|\bnet\s*worth\b|\bdebt\b|\bloan\b|\bmortgage\b|\bcredit\s*card\b|\bbank\s*account\b|\biban\b|\bswift\s*code\b|\b\d+k\b)/i,
  // Legal matters
  /\b(lawsuit|attorney|lawyer|legal\s*matter|court|settlement|liability|dispute|litigation|NDA|non-disclosure|sued|suing|arrested|arrest|criminal|conviction|parole|probation|charges?)\b/i,
  // Family / relationships (broadened — H2 fix)
  /\b(marriage|married|divorced?|separation|romantic\s*relationship|spouse|boyfriend|girlfriend|custody|wife|husband|partner|son|daughter|mother|father|parent|sibling|brother|sister|kids?|children|family|relative|grandparent|grandchild|niece|nephew|uncle|aunt)\b/i,
  // Location / home address (broadened — H2 fix)
  /\b(home\s*address|street\s*address|zip\s*code|postal\s*code|lives?\s*at|located\s*at|\bresidence\b|home\s*location|\b\d{1,6}\s{1,3}[A-Za-z]{1,30}\s{1,3}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Court|Ct|Way|Place|Pl)\b)/i,
  // Identity documents (broadened — H2 fix)
  /\b(ssn|social\s*security\s*(?:number)?|passport\s*(?:number)?|driver.?s\s*licen[sc]e|national\s*id|sin\s*(?:number)?|birth\s*certificate|identity\s*document|national\s*insurance)\b/i,
  // Personal facts about an unnamed relative. Named third parties are handled in NAMED_PERSON below
  // (case-sensitive and bounded, so cost is linear in the input).
  /\b(?:my|his|her|their)\s{1,3}(?:wife|husband|son|daughter|mother|father|brother|sister|partner|child|parent)\b.{0,50}\b(health|salary|income|debt|diagnosis|treatment|address|arrested|pregnancy|ill|sick|cancer|depression|disorder)\b/i,
];

const NAMED_PERSON = /\b[A-Z][a-z]{1,20}(?: [A-Z][a-z]{1,20}){1,3}\b/g;
const THIRD_PARTY_FACT = /\b(health|salary|income|debt|diagnosis|treatment|address|arrested|pregnancy|ill|sick|cancer|depression|disorder)\b/i;

function namedPersonFact(text: string): boolean {
  NAMED_PERSON.lastIndex = 0;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = NAMED_PERSON.exec(text)) !== null && guard++ < 500) {
    const end = m.index + m[0].length;
    const hit = THIRD_PARTY_FACT.exec(text.slice(end, end + 70));
    if (hit && hit.index <= 50) return true;
  }
  return false;
}

/** Longest text any pattern sees at once. Longer input is scanned in overlapping windows, so cost is linear. */
export const CLASSIFY_WINDOW = 4000;
/** Longest memory statement that is classified or stored. */
export const MAX_STATEMENT_CHARS = 4000;

function windows(text: string): string[] {
  if (text.length <= CLASSIFY_WINDOW) return [text];
  const out: string[] = [];
  const step = CLASSIFY_WINDOW - 200;
  for (let i = 0; i < text.length && out.length < 64; i += step) out.push(text.slice(i, i + CLASSIFY_WINDOW));
  return out;
}

export function isSensitive(statement: string): boolean {
  return windows(statement).some((w) => SENSITIVE_PATTERNS.some((p) => p.test(w)) || namedPersonFact(w));
}

/**
 * Store the completed chat exchange as a source-linked record. This is a work summary, not a
 * verified-facts extraction, so it follows the SAME rules as extractAndStoreMemories (3b):
 * - Must be started detached (`void recordCompletedTurn(...).catch(() => {})`), never awaited in
 *   the response. It never throws.
 * - Skipped (ledger memory_auto_skipped, reason only) for tainted or external-content turns and
 *   injection-blocked messages (B11), and when the daily cap is reached (B12).
 * - Secrets are dropped before the permission check (B6); sensitive text needs
 *   memory_auto_write_sensitive (Class B), routine text memory_auto_write (Class A) (B4/B5).
 * - MAMBA turns are stored only as a hypothesis, confidence at most 0.4, never as fact (B10).
 * - Rows carry source 'auto', the conversation and message ids, confidence at most 0.8 (B9).
 *   Episodic rows have no epistemicStatus column; they are INFERRED by construction (source 'auto').
 * - Identical text for the same user is not stored twice.
 * - Ledger rows carry ids and counts only, never the text (B7).
 */
export async function recordCompletedTurn(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  userMessage: string;
  assistantReply: string;
  persona: string;
  projectId?: string | null;
  correlationId: string;
  /** External content (email, web, files, tool results) was read this turn. */
  externalContentThisTurn?: boolean;
  /** The conversation was already tainted by external content. */
  conversationTainted?: boolean;
  /** The user message was injection-blocked. */
  injectionBlocked?: boolean;
}): Promise<void> {
  try {
    await recordCompletedTurnInner(input);
  } catch (err) {
    logger.error('auto-memory: completed turn record failed', {
      userId: input.userId, correlationId: input.correlationId, error: (err as Error)?.message,
    });
  }
}

async function recordCompletedTurnInner(input: Parameters<typeof recordCompletedTurn>[0]): Promise<void> {
  const { userId, conversationId, messageId, userMessage, assistantReply, persona, projectId, correlationId } = input;
  if (!userId || !conversationId || !messageId) return;
  const isMamba = persona.toUpperCase() === 'MAMBA';
  if (!userMessage.trim() && !assistantReply.trim()) return;
  // Cap BEFORE any pattern runs: classification and storage see at most MAX_STATEMENT_CHARS.
  const half = Math.floor((MAX_STATEMENT_CHARS - 200) / 2);
  const truncated = userMessage.length > half || assistantReply.length > half;
  const statement = `Completed conversation turn with ${persona}.\nUser request:\n${userMessage.slice(0, half)}\n\nAssistant result:\n${assistantReply.slice(0, half)}`;

  const skip = (reason: string) => recordActionSafe({
    userId, initiator: 'system', persona, action: 'memory_auto_skipped', permissionClass: 'A',
    status: 'VALIDATED', inputSummary: `reason: ${reason}`, correlationId,
  });

  // B11: external content never becomes memory.
  if (input.injectionBlocked) { await skip('injection_blocked'); return; }
  if (input.externalContentThisTurn || input.conversationTainted) { await skip('external_content'); return; }

  // B6: secrets are dropped before the permission check; no content in the row.
  if (isSecret(statement)) {
    await recordActionSafe({
      userId, initiator: 'system', persona, action: 'memory_secret_dropped', permissionClass: 'A',
      status: 'VALIDATED', correlationId,
    });
    return;
  }

  // B12: daily cap.
  if (await dailyCapReached(userId, persona, correlationId)) return;

  const sensitive = isSensitive(statement);
  const permissionClass: 'A' | 'B' = sensitive ? 'B' : 'A';
  let permission: Awaited<ReturnType<typeof checkPermission>>;
  try {
    permission = await checkPermission(
      userId,
      sensitive ? 'memory_auto_write_sensitive' : 'memory_auto_write',
      permissionClass,
      correlationId,
    );
  } catch {
    permission = { allowed: false, method: 'requires_confirmation', reason: 'permission engine error' };
  }
  if (!permission.allowed) {
    await recordActionSafe({
      userId, initiator: 'system', persona, action: 'memory_auto_write_denied',
      permissionClass, status: 'DENIED',
      inputSummary: `category:${sensitive ? 'sensitive' : 'routine'} reason:${permission.reason ?? 'denied'}`, correlationId,
    });
    return;
  }

  // Identical text for this user is never stored twice (userId-scoped).
  try {
    const existing = isMamba
      ? await prisma.hypothesis.findFirst({ where: { userId, statement }, select: { id: true } })
      : await prisma.memoryEpisode.findFirst({ where: { userId, summary: statement }, select: { id: true } });
    if (existing) {
      await recordActionSafe({
        userId, initiator: 'system', persona, action: 'memory_deduplicated', permissionClass,
        status: 'VALIDATED', inputSummary: `type:${isMamba ? 'hypothesis' : 'episodic'}`, outputSummary: `id:${existing.id}`, correlationId,
      });
      return;
    }
  } catch { /* dedup lookup failure is not fatal; fall through to the write */ }

  try {
    const memType = isMamba ? 'hypothesis' : 'episodic';
    const result = await writeMemory({
      userId,
      type: memType,
      statement,
      projectId: projectId ?? null,
      source: 'auto',
      sourceId: conversationId,
      messageId,
      extractorModel: 'turn_summary',
      eventType: 'completed_work',
      confidence: isMamba ? 0.4 : 0.8,
      importance: 0.7,
      epistemicStatus: 'INFERRED',
      entities: [`conversation:${conversationId}`],
      ...(isMamba ? { mambaMode: 'OBSIDIAN' } : {}),
    });
    try { await incrementDailyCount(userId); } catch { /* non-fatal */ }
    await recordActionSafe({
      userId, initiator: 'system', persona,
      action: result.deduped ? 'memory_deduplicated' : 'memory_auto_written',
      permissionClass, status: 'VALIDATED',
      inputSummary: `type:${memType}${truncated ? ' truncated' : ''}`, outputSummary: `id:${result.id}`, correlationId,
    });
  } catch (err) {
    logger.error('auto-memory: completed work record failed', {
      userId, correlationId, error: (err as Error)?.message,
    });
    await recordActionSafe({
      userId, initiator: 'system', persona, action: 'memory_auto_written',
      permissionClass, status: 'FAILED', inputSummary: 'type: completed_work', correlationId,
    });
  }
}

// ── B12 — Daily cap helpers ───────────────────────────────────────────────────

const DEFAULT_DAILY_CAP = 200;

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

async function getDailyCount(userId: string): Promise<number> {
  const today = todayDateString();
  const row = await prisma.memoryDailyCap.findUnique({
    where: { userId_date: { userId, date: today } },
    select: { count: true },
  });
  return row?.count ?? 0;
}

async function incrementDailyCount(userId: string): Promise<void> {
  const today = todayDateString();
  await prisma.memoryDailyCap.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, count: 1 },
    update: { count: { increment: 1 } },
  });
}

async function hasTodayCapLedgerRow(userId: string): Promise<boolean> {
  const today = todayDateString();
  const start = new Date(`${today}T00:00:00.000Z`);
  const end = new Date(`${today}T23:59:59.999Z`);
  const count = await prisma.action.count({
    where: {
      userId,
      action: 'memory_cap_reached',
      createdAt: { gte: start, lte: end },
    },
  });
  return count > 0;
}

/** True when the user's daily auto-memory cap is reached; ledgers memory_cap_reached once per day. */
async function dailyCapReached(userId: string, persona: string, correlationId: string): Promise<boolean> {
  const cap = Math.max(1, parseInt(process.env.MEMORY_DAILY_CAP ?? `${DEFAULT_DAILY_CAP}`, 10));
  let currentCount: number;
  try {
    currentCount = await getDailyCount(userId);
  } catch {
    // Fail closed: if the count cannot be read, nothing is written.
    await recordActionSafe({
      userId, initiator: 'system', persona, action: 'memory_auto_skipped', permissionClass: 'A',
      status: 'VALIDATED', inputSummary: 'reason: cap_check_failed', correlationId,
    });
    return true;
  }
  if (currentCount < cap) return false;
  try {
    if (!(await hasTodayCapLedgerRow(userId))) {
      await recordActionSafe({
        userId, initiator: 'system', persona, action: 'memory_cap_reached', permissionClass: 'A',
        status: 'VALIDATED', inputSummary: `Daily cap of ${cap} reached`, correlationId,
      });
    }
  } catch { /* non-blocking */ }
  return true;
}

// ── B8 — Relative date resolver ───────────────────────────────────────────────

export function resolveEventDate(dateStr: string, _timezone: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const lower = dateStr.toLowerCase().trim();

  // Relative shorthand words
  const now = new Date();
  if (lower === 'today') return new Date(now.toDateString());
  if (lower === 'yesterday') {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (lower === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (/last\s+week/i.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (/last\s+month/i.test(lower)) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }

  // Attempt ISO 8601 or any other parseable date string
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) return new Date(parsed);

  return null;
}

// ── Main extraction entry point (B1) ─────────────────────────────────────────

/**
 * Extract 0–5 facts from the completed turn and write them to memory.
 *
 * MUST be called as a detached promise:
 *   void extractAndStoreMemories(input).catch(() => {});
 *
 * It never throws. Any failure is logged and silently discarded.
 */
export async function extractAndStoreMemories(
  input: ExtractAndStoreMemoriesInput,
): Promise<void> {
  const {
    userId,
    conversationId,
    messageId,
    persona,
    correlationId,
    conversationTainted,
    injectionBlocked,
  } = input;
  // Cap before any pattern runs or any text reaches the model.
  const userMessage = input.userMessage.slice(0, MAX_STATEMENT_CHARS);
  const assistantReply = input.assistantReply.slice(0, MAX_STATEMENT_CHARS);

  // B11 — Skip if conversation is tainted by external content
  if (conversationTainted) {
    await recordActionSafe({
      userId,
      initiator: 'system',
      persona,
      action: 'memory_auto_skipped',
      permissionClass: 'A',
      status: 'VALIDATED',
      inputSummary: 'reason: external_content',
      correlationId,
    });
    return;
  }

  // B11 — Skip if user message was injection-blocked
  if (injectionBlocked) {
    await recordActionSafe({
      userId,
      initiator: 'system',
      persona,
      action: 'memory_auto_skipped',
      permissionClass: 'A',
      status: 'VALIDATED',
      inputSummary: 'reason: injection_blocked',
      correlationId,
    });
    return;
  }

  // H3 secondary — skip entire turn if user message contains a secret (H3 fix)
  if (isSecret(userMessage)) {
    await recordActionSafe({
      userId,
      initiator: 'system',
      persona,
      action: 'memory_auto_skipped',
      permissionClass: 'A',
      status: 'VALIDATED',
      inputSummary: 'reason: secret_in_user_message',
      correlationId,
    });
    return;
  }

  // B12 — Daily cap check (before any model call)
  if (await dailyCapReached(userId, persona, correlationId)) return;

  // B2 — Load extraction model from env (no provider SDK here)
  const extractorModel = localOnlyModel(
    process.env.EXTRACTION_MODEL ?? process.env.DEFAULT_MODEL ?? 'wink-qwen3.5-9b-8k');

  // B8 — Fetch user timezone for relative-date resolution
  let timezone = 'UTC';
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    timezone = profile?.timezone ?? 'UTC';
  } catch { /* non-fatal — use UTC */ }

  // B3 — Wrap conversation text as untrusted data; never merge into system instructions
  const wrappedUser = wrapUntrustedContent(userMessage, 'user_message', conversationId);
  const wrappedAssistant = wrapUntrustedContent(assistantReply, 'assistant_reply', conversationId);

  const systemPrompt = `You are a Memory Extraction Agent for WHINK, a personal AI CEO assistant.
Extract 0-5 memorable, atomic facts from the conversation below.
Return ONLY a valid JSON array — no markdown, no explanation.
Each element: { "type": "episodic"|"semantic"|"procedural", "statement": string, "confidence": number (0.0-1.0), "eventDate": string|null }
- episodic: a time-bound event. Include eventDate as ISO 8601 when known (relative phrases like "yesterday" are acceptable).
- semantic: a timeless fact (preferences, skills, goals, relationships, work context).
- procedural: a how-to, standing instruction, or workflow preference.
Rules:
- One atomic fact per item. From the perspective of the account holder.
- Skip vague, trivial, or already common-knowledge facts.
- Never store passwords, API keys, card numbers, tokens, or credentials.
- Return [] if there is nothing worth remembering.`;

  const userPrompt = `${wrappedUser}\n\n${wrappedAssistant}`;

  let rawResult: string;
  try {
    rawResult = await chatOnce({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: extractorModel,
      maxTokens: 512,
      temperature: 0,
    });
  } catch (err) {
    logger.error('auto-memory: extraction call failed', {
      userId,
      correlationId,
      error: (err as Error)?.message,
    });
    return;
  }

  // Parse candidates
  let candidates: RawCandidate[] = [];
  try {
    const trimmed = rawResult.trim().replace(/^```(?:json)?\n?|```$/g, '').trim();
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) candidates = parsed;
  } catch {
    return; // parse failure is non-fatal
  }

  // B12 — Cap at 5 candidates per turn
  candidates = candidates.slice(0, 5);

  for (const candidate of candidates) {
    if (
      !candidate ||
      typeof candidate.statement !== 'string' ||
      candidate.statement.trim().length < 5
    ) {
      continue;
    }

    const statement = candidate.statement.trim().slice(0, MAX_STATEMENT_CHARS);

    // B6 — Drop secrets before any ledger content is written
    if (isSecret(statement)) {
      await recordActionSafe({
        userId,
        initiator: 'system',
        persona,
        action: 'memory_secret_dropped',
        permissionClass: 'A',
        status: 'VALIDATED',
        // No content in the ledger row — the spec says no statement for dropped secrets
        correlationId,
      });
      continue;
    }

    // B4/B5 — Sensitivity classification (done in WHINK code, not trusted from extractor)
    const sensitive = isSensitive(statement);
    const permClass: 'A' | 'B' = sensitive ? 'B' : 'A';
    const capability = sensitive ? 'memory_auto_write_sensitive' : 'memory_auto_write';

    // Permission check before any write
    let perm: Awaited<ReturnType<typeof checkPermission>>;
    try {
      perm = await checkPermission(userId, capability, permClass, correlationId);
    } catch {
      // Permission engine failure — deny safely
      perm = { allowed: false, method: 'requires_confirmation', reason: 'permission engine error' };
    }

    if (!perm.allowed) {
      await recordActionSafe({
        userId,
        initiator: 'system',
        persona,
        action: 'memory_auto_write_denied',
        permissionClass: permClass,
        status: 'DENIED',
        // B7: no statement text in denial rows for sensitive category
        inputSummary: `category:${sensitive ? 'sensitive' : 'routine'} reason:${perm.reason ?? 'denied'}`,
        correlationId,
      });
      continue;
    }

    // B10 — MAMBA → hypothesis store, confidence capped at 0.4
    let memType: 'episodic' | 'semantic' | 'procedural' | 'hypothesis';
    // B9 — Confidence capped at 0.8 for auto-written memories
    let confidence = typeof candidate.confidence === 'number'
      ? Math.min(Math.max(candidate.confidence, 0), 0.8)
      : 0.6;

    if (persona.toUpperCase() === 'MAMBA') {
      memType = 'hypothesis';
      confidence = Math.min(confidence, 0.4);
    } else {
      const rawType = candidate.type;
      if (rawType === 'episodic') memType = 'episodic';
      else if (rawType === 'procedural') memType = 'procedural';
      else memType = 'semantic';
    }

    // B8 — Resolve relative event dates for episodic memories
    let eventDate: Date | undefined;
    if (memType === 'episodic' && candidate.eventDate) {
      const resolved = resolveEventDate(candidate.eventDate, timezone);
      if (resolved) eventDate = resolved;
    }

    // Write the memory
    try {
      const result = await writeMemory({
        userId,
        type: memType,
        statement,
        source: 'auto',
        sourceId: conversationId,
        messageId,
        extractorModel,
        confidence,
        epistemicStatus: 'INFERRED',
        eventDate,
      });

      // Increment daily cap counter (B12)
      try {
        await incrementDailyCount(userId);
      } catch { /* non-fatal */ }

      // B7 — Ledger the outcome
      const ledgerAction = result.deduped ? 'memory_deduplicated' : 'memory_auto_written';
      await recordActionSafe({
        userId,
        initiator: 'system',
        persona,
        action: ledgerAction,
        permissionClass: permClass,
        status: 'VALIDATED',
        inputSummary: `type:${memType}`,
        outputSummary: `id:${result.id}`,
        correlationId,
      });
    } catch (err) {
      logger.error('auto-memory: writeMemory failed', {
        userId,
        correlationId,
        error: (err as Error)?.message,
      });
      await recordActionSafe({
        userId,
        initiator: 'system',
        persona,
        action: 'memory_auto_written',
        permissionClass: permClass,
        status: 'FAILED',
        inputSummary: `type:${memType} err:${(err as Error)?.message?.slice(0, 80) ?? 'unknown'}`,
        correlationId,
      });
    }
  }
}
