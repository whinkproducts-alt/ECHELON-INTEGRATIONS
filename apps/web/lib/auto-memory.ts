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
  /(key|token|secret|api[_-]?key)\s*[:=\s]\s*[A-Za-z0-9_\-]{16,}/i,
  // Vendor key prefixes
  /\b(sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|xox[bp]-[A-Za-z0-9\-]{20,}|AIza[A-Za-z0-9_\-]{35})/,
  // JWT (three base64url segments separated by dots)
  /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/,
  // High-entropy random tokens (24+ alphanum/special chars)
  /[A-Za-z0-9+/]{24,}={0,2}(?!\w)/,
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
  /(\$[\d,]+(?:\.\d{2})?|\b\d{5,}\s*(?:dollars?|usd|cad)\b|\baccount\s*number\b|\brouting\s*number\b|\bsalary\b|\bincome\b|\bearns?\b|\bowes?\b|\bnet\s*worth\b|\bdebt\b|\bloan\b|\bmortgage\b|\bcredit\s*card\b|\bbank\s*account\b|\biban\b|\bswift\s*code\b|\b\d+k\b)/i,
  // Legal matters
  /\b(lawsuit|attorney|lawyer|legal\s*matter|court|settlement|liability|dispute|litigation|NDA|non-disclosure|sued|suing|arrested|arrest|criminal|conviction|parole|probation|charges?)\b/i,
  // Family / relationships (broadened — H2 fix)
  /\b(marriage|married|divorced?|separation|romantic\s*relationship|spouse|boyfriend|girlfriend|custody|wife|husband|partner|son|daughter|mother|father|parent|sibling|brother|sister|kids?|children|family|relative|grandparent|grandchild|niece|nephew|uncle|aunt)\b/i,
  // Location / home address (broadened — H2 fix)
  /\b(home\s*address|street\s*address|zip\s*code|postal\s*code|lives?\s*at|located\s*at|\bresidence\b|home\s*location|\d+\s+[A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Court|Ct|Way|Place|Pl)\b)/i,
  // Identity documents (broadened — H2 fix)
  /\b(ssn|social\s*security\s*(?:number)?|passport\s*(?:number)?|driver.?s\s*licen[sc]e|national\s*id|sin\s*(?:number)?|birth\s*certificate|identity\s*document|national\s*insurance)\b/i,
  // Personal facts about a named third party OR unnamed relative (H2 fix)
  /\b(?:[A-Z][a-z]+(?: [A-Z][a-z]+)+|(?:my|his|her|their)\s+(?:wife|husband|son|daughter|mother|father|brother|sister|partner|child|parent))\b.{0,50}\b(health|salary|income|debt|diagnosis|treatment|address|arrested|pregnancy|ill|sick|cancer|depression|disorder)\b/i,
];

export function isSensitive(statement: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(statement));
}

/**
 * Store the completed chat exchange as a source-linked episodic record. This is a verbatim
 * work record, not a verified-facts extraction: retrieval wraps it as untrusted content.
 * Secrets are never persisted here; sensitive records still pass the normal Class B gate.
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
}): Promise<void> {
  const { userId, conversationId, messageId, userMessage, assistantReply, persona, projectId, correlationId } = input;
  const statement = `Completed conversation turn with ${persona}.\nUser request:\n${userMessage}\n\nAssistant result:\n${assistantReply}`;
  if (!userId || !conversationId || !messageId || !statement.trim()) return;

  if (isSecret(statement)) {
    await recordActionSafe({
      userId, initiator: 'system', persona, action: 'memory_task_record_skipped',
      permissionClass: 'A', status: 'VALIDATED', inputSummary: 'reason: secret_detected', correlationId,
    });
    return;
  }

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
      userId, initiator: 'system', persona, action: 'memory_task_record_denied',
      permissionClass, status: 'DENIED', inputSummary: `reason: ${sensitive ? 'sensitive' : 'permission'}`, correlationId,
    });
    return;
  }

  try {
    await writeMemory({
      userId,
      type: 'episodic',
      statement,
      projectId: projectId ?? null,
      source: 'conversation',
      sourceId: conversationId,
      messageId,
      extractorModel: 'verbatim_exchange',
      eventType: 'completed_work',
      confidence: 1,
      importance: 0.7,
    });
    await recordActionSafe({
      userId, initiator: 'system', persona, action: 'memory_task_recorded',
      permissionClass, status: 'VALIDATED', inputSummary: 'type: completed_work', correlationId,
    });
  } catch (err) {
    logger.error('auto-memory: completed work record failed', {
      userId, correlationId, error: (err as Error)?.message,
    });
    await recordActionSafe({
      userId, initiator: 'system', persona, action: 'memory_task_record_failed',
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
    userMessage,
    assistantReply,
    persona,
    correlationId,
    conversationTainted,
    injectionBlocked,
  } = input;

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
  const cap = Math.max(1, parseInt(process.env.MEMORY_DAILY_CAP ?? `${DEFAULT_DAILY_CAP}`, 10));
  let currentCount: number;
  try {
    currentCount = await getDailyCount(userId);
  } catch {
    currentCount = 0; // non-fatal: proceed with extraction
  }
  if (currentCount >= cap) {
    try {
      const alreadyLogged = await hasTodayCapLedgerRow(userId);
      if (!alreadyLogged) {
        await recordActionSafe({
          userId,
          initiator: 'system',
          persona,
          action: 'memory_cap_reached',
          permissionClass: 'A',
          status: 'VALIDATED',
          inputSummary: `Daily cap of ${cap} reached`,
          correlationId,
        });
      }
    } catch { /* non-blocking */ }
    return;
  }

  // B2 — Load extraction model from env (no provider SDK here)
  const extractorModel =
    process.env.EXTRACTION_MODEL ?? process.env.DEFAULT_MODEL ?? 'wink-qwen3.5-9b-8k';

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

    const statement = candidate.statement.trim();

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
