/**
 * Daily SMS briefing to the owner (CSA Phase 2).
 *
 * Flow each tick: is today inside the configured window, is it past the send time, has the
 * briefing already gone out today (ledger, no new table) -> collect the directorate reports ->
 * format a short GSM-7 message -> checkPermission -> sendSms -> ledger.
 *
 * Safety:
 * - Off by default. Nothing is sent until BRIEFING_SMS_ENABLED=true.
 * - The recipient comes from env only. No model, report or tool input can change it.
 * - This is not a model tool, so injected text cannot trigger it.
 * - Report files are untrusted data: parsed, type checked, stripped to a safe charset, capped.
 *   They are never sent to a model.
 * - Capability sms_briefing_send is Class B: it needs a delegation row or autonomy 2 or higher.
 *   Without one, the send is DENIED and ledgered, once per day.
 * - A Twilio failure never throws. It is logged, ledgered as FAILED, and retried a few times.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';
import { recordActionSafe, countByCorrelation } from '@/lib/ledger';
import { checkPermission, logSecurityEvent } from '@/lib/permission-engine';
import { sendSms, maskNumber, isE164, twilioConfigured, type SmsResult } from '@/lib/twilio-adapter';

export const SMS_TOOL = 'sms_briefing_send';
export const MAX_SEGMENTS = 3;
export const SEGMENT_CHARS = 153; // GSM-7 concatenated segment size.
export const MAX_SMS_CHARS = MAX_SEGMENTS * SEGMENT_CHARS;
const MAX_ATTEMPTS_PER_DAY = 3;
const RETRY_SPACING_MS = 5 * 60_000;
const CATCH_UP_MINUTES = 90;
const STALE_AFTER_MS = 36 * 60 * 60_000;
const MAX_REPORT_FILES = 20;
const MAX_REPORT_BYTES = 64 * 1024;
const WORKER_INTERVAL_MS = 60_000;

// ── Config ─────────────────────────────────────────────────────

export interface BriefingConfig {
  enabled: boolean;
  userId: string;
  to: string;
  sendTime: string; // HH:MM in tz
  tz: string;
  startDate: string; // YYYY-MM-DD, local
  endDate: string;
  reportsDir: string;
}

type Env = Record<string, string | undefined>;

export function loadBriefingConfig(env: Env = process.env): BriefingConfig {
  return {
    enabled: env.BRIEFING_SMS_ENABLED === 'true',
    userId: env.BRIEFING_USER_ID ?? '',
    to: env.BRIEFING_SMS_TO ?? '',
    sendTime: env.BRIEFING_SEND_TIME || '16:15',
    tz: env.BRIEFING_TZ || 'America/Edmonton',
    startDate: env.BRIEFING_START_DATE || '2026-10-18',
    endDate: env.BRIEFING_END_DATE || '2026-11-19',
    reportsDir: env.BRIEFING_REPORTS_DIR ?? '',
  };
}

/** Returns a list of config problems. Empty means ready. */
export function configProblems(c: BriefingConfig, env: Env = process.env): string[] {
  const p: string[] = [];
  if (!c.userId) p.push('BRIEFING_USER_ID is not set');
  if (!isE164(c.to)) p.push('BRIEFING_SMS_TO is not a valid E.164 number');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.sendTime)) p.push('BRIEFING_SEND_TIME must be HH:MM');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(c.endDate)) p.push('BRIEFING_START_DATE and BRIEFING_END_DATE must be YYYY-MM-DD');
  try { new Intl.DateTimeFormat('en-CA', { timeZone: c.tz }); } catch { p.push('BRIEFING_TZ is not a valid time zone'); }
  if (!c.reportsDir) p.push('BRIEFING_REPORTS_DIR is not set');
  if (!twilioConfigured(env)) p.push('Twilio credentials are missing or malformed');
  return p;
}

// ── Time ───────────────────────────────────────────────────────

export function localParts(now: Date, tz: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** True when now is inside the date window and between the send time and the catch up limit. */
export function isDue(now: Date, c: BriefingConfig): { due: boolean; date: string } {
  const { date, minutes } = localParts(now, c.tz);
  const [h, m] = c.sendTime.split(':').map(Number);
  const target = h * 60 + m;
  const inWindow = date >= c.startDate && date <= c.endDate;
  return { due: inWindow && minutes >= target && minutes < target + CATCH_UP_MINUTES, date };
}

// ── Reports ────────────────────────────────────────────────────

export interface DirectorateReport {
  directorate: string;
  reportedAt?: string;
  pipeline?: { emailsSent?: number; demosBooked?: number; conversionRatePct?: number; setupFeesCollected?: number };
  engineering?: { items?: Array<{ name: string; percentComplete: number }> };
  blockers?: string[];
  revenue?: { mrr?: number; setupFeesYtd?: number };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9 ? v : undefined);

/** Keep a small safe GSM-7 subset. No hyphens or dashes, no brackets, no emoji. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[‐-―\-]/g, ' ')
    .replace(/[^A-Za-z0-9 .,:;!?()%$/@#&+'"=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Parse one untrusted report object. Unknown keys are dropped. Returns null if unusable. */
export function parseReport(raw: unknown): DirectorateReport | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, any>;
  const out: DirectorateReport = { directorate: cleanText(r.directorate, 40) || 'unknown' };
  if (typeof r.reportedAt === 'string' && !Number.isNaN(Date.parse(r.reportedAt))) out.reportedAt = r.reportedAt;
  if (r.pipeline && typeof r.pipeline === 'object') {
    out.pipeline = {
      emailsSent: num(r.pipeline.emailsSent), demosBooked: num(r.pipeline.demosBooked),
      conversionRatePct: num(r.pipeline.conversionRatePct), setupFeesCollected: num(r.pipeline.setupFeesCollected),
    };
  }
  if (r.engineering && Array.isArray(r.engineering.items)) {
    out.engineering = {
      items: r.engineering.items.slice(0, 6).flatMap((i: any) => {
        const name = cleanText(i?.name, 14); const pct = num(i?.percentComplete);
        return name && pct !== undefined && pct <= 100 ? [{ name, percentComplete: Math.round(pct) }] : [];
      }),
    };
  }
  if (Array.isArray(r.blockers)) out.blockers = r.blockers.slice(0, 5).map((b: unknown) => cleanText(b, 60)).filter(Boolean);
  if (r.revenue && typeof r.revenue === 'object') out.revenue = { mrr: num(r.revenue.mrr), setupFeesYtd: num(r.revenue.setupFeesYtd) };
  return out;
}

export async function loadReports(dir: string, now: Date = new Date()): Promise<DirectorateReport[]> {
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')).sort().slice(0, MAX_REPORT_FILES);
  } catch (e) {
    logger.warn('briefing reports directory unreadable', { error: (e as Error)?.name });
    return [];
  }
  const reports: DirectorateReport[] = [];
  for (const n of names) {
    try {
      const full = path.join(dir, n);
      const st = await fs.stat(full);
      if (!st.isFile() || st.size > MAX_REPORT_BYTES) continue;
      const rep = parseReport(JSON.parse(await fs.readFile(full, 'utf8')));
      if (!rep) continue;
      if (rep.reportedAt && now.getTime() - Date.parse(rep.reportedAt) > STALE_AFTER_MS) continue; // stale: ignore
      reports.push(rep);
    } catch {
      logger.warn('briefing report skipped', { file: n });
    }
  }
  return reports;
}

// ── Format ─────────────────────────────────────────────────────

const money = (n: number | undefined) => (n === undefined ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`);
const count = (n: number | undefined) => (n === undefined ? 'n/a' : String(Math.round(n)));

/** Four lines: pipeline, build, blockers, revenue. Total length capped at MAX_SMS_CHARS. */
export function formatBriefing(reports: DirectorateReport[], localDate: string): string {
  const first = <T,>(f: (r: DirectorateReport) => T | undefined): T | undefined => {
    for (const r of reports) { const v = f(r); if (v !== undefined) return v; }
    return undefined;
  };
  const p = first((r) => r.pipeline);
  const items = reports.flatMap((r) => r.engineering?.items ?? []);
  const blockers = reports.flatMap((r) => r.blockers ?? []);
  const rev = first((r) => r.revenue);

  const pipeline = p
    ? `Sales: ${count(p.emailsSent)} emails, ${count(p.demosBooked)} demos, ${p.conversionRatePct === undefined ? 'n/a' : `${p.conversionRatePct.toFixed(1)}%`} conv, ${money(p.setupFeesCollected)} setup`
    : 'Sales: no report';
  const build = items.length ? `Build: ${items.map((i) => `${i.name} ${i.percentComplete}%`).join(', ')}` : 'Build: no report';
  const block = blockers.length ? `Blockers: ${blockers.join('; ')}` : reports.length ? 'Blockers: none' : 'Blockers: no report';
  const revenue = rev ? `Revenue: MRR ${money(rev.mrr)}, setup YTD ${money(rev.setupFeesYtd)}` : 'Revenue: no report';

  const text = cleanText(`WHINK CSA ${localDate.slice(5)}`, 20) + '\n' +
    [pipeline, build, block, revenue].map((l) => l.replace(/[^A-Za-z0-9 .,:;!?()%$/@#&+'"=]/g, ' ')).join('\n');
  return text.length > MAX_SMS_CHARS ? text.slice(0, MAX_SMS_CHARS - 3) + '...' : text;
}

export function segmentCount(body: string): number {
  return body.length <= 160 ? 1 : Math.ceil(body.length / SEGMENT_CHARS);
}

// ── Run ────────────────────────────────────────────────────────

export type TickOutcome =
  | 'skipped_disabled' | 'skipped_not_due' | 'skipped_done' | 'skipped_config' | 'skipped_spacing'
  | 'denied' | 'sent' | 'failed';

export interface TickDeps {
  env?: Env;
  send?: (i: { to: string; body: string }) => Promise<SmsResult>;
  loadReports?: (dir: string, now: Date) => Promise<DirectorateReport[]>;
}

let lastFailureAt = 0;
let lastProblemLogDay = '';

export async function runBriefingTick(now: Date = new Date(), deps: TickDeps = {}): Promise<TickOutcome> {
  const env = deps.env ?? process.env;
  const c = loadBriefingConfig(env);
  if (!c.enabled) return 'skipped_disabled';

  const problems = configProblems(c, env);
  if (problems.length) {
    // Log once per UTC day per process, not every minute.
    const day = now.toISOString().slice(0, 10);
    if (lastProblemLogDay !== day) {
      lastProblemLogDay = day;
      logger.error('sms briefing enabled but not ready', { problems });
    }
    return 'skipped_config';
  }

  const { due, date } = isDue(now, c);
  if (!due) return 'skipped_not_due';

  const correlationId = `sms-briefing:${date}`;
  const [sent, failed, denied] = await Promise.all([
    countByCorrelation(c.userId, SMS_TOOL, correlationId, ['VALIDATED', 'SUBMITTED']),
    countByCorrelation(c.userId, SMS_TOOL, correlationId, ['FAILED']),
    countByCorrelation(c.userId, SMS_TOOL, correlationId, ['DENIED']),
  ]);
  if (sent > 0 || denied > 0 || failed >= MAX_ATTEMPTS_PER_DAY) return 'skipped_done';
  if (failed > 0 && now.getTime() - lastFailureAt < RETRY_SPACING_MS) return 'skipped_spacing';

  const base = { userId: c.userId, initiator: 'automation' as const, tool: SMS_TOOL, correlationId, permissionClass: 'B', action: `tool_executed: ${SMS_TOOL}` };
  const started = Date.now();

  const perm = await checkPermission(c.userId, SMS_TOOL, 'B', correlationId);
  if (!perm.allowed) {
    // A protected action (sending account data out) cannot be unlocked by a delegation: it needs the owner's approval.
    const message = perm.protected
      ? `Not sent: protected ${perm.category ?? 'proprietary'} action. A delegation cannot unlock it; it needs the owner's approval.`
      : `Not sent: ${perm.reason ?? 'permission denied'}. Grant a delegation for ${SMS_TOOL} to enable.`;
    await recordActionSafe({ ...base, status: 'DENIED', validationResult: perm.method, outputSummary: message, ...(perm.category ? { protectedCategory: perm.category } : {}) });
    if (perm.protected) {
      try {
        await logSecurityEvent(c.userId, 'protected_action_blocked', `${SMS_TOOL} blocked (${perm.category ?? 'proprietary'}): the briefing needs the owner's approval and cannot be sent by automation`, correlationId, 'DENIED');
      } catch (e) {
        logger.error('security event write failed', { error: (e as Error)?.message });
      }
    }
    logger.warn('sms briefing denied by permission engine', { correlationId });
    return 'denied';
  }

  const reports = await (deps.loadReports ?? loadReports)(c.reportsDir, now);
  const body = formatBriefing(reports, date);
  const result = await (deps.send ?? ((i) => sendSms(i, { env })))({ to: c.to, body });
  const latencyMs = Date.now() - started;
  const summary = `to ${maskNumber(c.to)}, ${body.length} chars, ${segmentCount(body)} segment(s), ${reports.length} report(s)`;

  if (result.ok) {
    await recordActionSafe({ ...base, status: 'VALIDATED', confirmationMethod: perm.method, latencyMs, inputSummary: summary, outputSummary: `Twilio ${result.status} ${result.sid}\n${body}` });
    return 'sent';
  }
  lastFailureAt = now.getTime();
  await recordActionSafe({ ...base, status: 'FAILED', confirmationMethod: perm.method, latencyMs, inputSummary: summary, outputSummary: `${result.reason}${result.code ? ` ${result.code}` : ''}: ${result.message}` });
  return 'failed';
}

// ── Worker ─────────────────────────────────────────────────────

const WORKER_KEY = Symbol.for('whink.smsBriefingWorker');

/** Starts the once per minute tick. Idempotent per process. Never throws. */
export function startBriefingWorker(): boolean {
  const g = globalThis as unknown as Record<symbol, unknown>;
  if (g[WORKER_KEY]) return false;
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runBriefingTick()
      .catch((e) => logger.error('sms briefing tick crashed', { error: (e as Error)?.message }))
      .finally(() => { running = false; });
  }, WORKER_INTERVAL_MS);
  timer.unref?.();
  g[WORKER_KEY] = timer;
  return true;
}

/** Test helper. */
export function _resetBriefingState(): void { lastFailureAt = 0; lastProblemLogDay = ''; }
