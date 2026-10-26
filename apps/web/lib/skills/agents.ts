/**
 * Picks the reviewers for the skill pipeline from the org-kit. Deterministic.
 *
 * Security agent: agents in the Cybersecurity & Resilience directorate, scored by the overlap
 * between the skill's words and the agent's skill/responsibility words, highest first, ties by agent_id.
 *
 * Committee: one director per directorate. Each directorate is scored by the overlap between the
 * skill's words and the directorate's term set (directorate and department names plus the distinct
 * skill and responsibility tags of its agents), divided by sqrt(term set size) so large directorates
 * do not dominate. Top 3 by score, ties by directorate name. When fewer than 3 directorates score above
 * zero, the remainder come from config defaultCommitteeDirectorates in listed order.
 */
import { readFile } from 'fs/promises';
import path from 'path';
import config from '@/config/skill-pipeline.json';
import { defaultOrgKitRoot, getOrgKit, type OrgAgent } from '@/lib/agent-loader';

const STOP = new Set(['with', 'that', 'this', 'from', 'have', 'will', 'your', 'about', 'into', 'when', 'what', 'they', 'them', 'their', 'then', 'than', 'also', 'such', 'each', 'more', 'most', 'other', 'which', 'these', 'those', 'work', 'support', 'team', 'services', 'management', 'business', 'general']);

export function wordsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 4 && !STOP.has(w)) out.add(w);
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of b) if (a.has(w)) n++;
  return n;
}

function oneLine(s: string, max = 200): string {
  return s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export interface ReviewerRecord { id: string; name: string; title: string; mission: string }

export async function pickSecurityAgent(skillText: string): Promise<ReviewerRecord> {
  const kit = await getOrgKit();
  const pool = kit.agents.filter((a: OrgAgent) => a.directorate === config.securityDirectorate);
  const words = wordsOf(skillText);
  const scored = pool.map((a) => ({
    a,
    s: overlap(words, wordsOf([...(a.skills ?? []), ...(a.responsibilities ?? [])].join(' ').replace(/_/g, ' ') + ' ' + a.department)),
  }));
  scored.sort((x, y) => y.s - x.s || (x.a.agent_id < y.a.agent_id ? -1 : x.a.agent_id > y.a.agent_id ? 1 : 0));
  const best = scored[0]?.a;
  if (!best) {
    return { id: 'fallback.security_reviewer', name: 'Security Reviewer', title: 'Cybersecurity reviewer', mission: 'Review untrusted content for threats.' };
  }
  return { id: best.agent_id, name: oneLine(best.name, 80), title: oneLine(best.title, 160), mission: oneLine(best.mission, 300) };
}

interface Directorate { name: string; director: string; departments?: Record<string, string> }

async function loadDirectorates(): Promise<Directorate[]> {
  const raw = await readFile(path.join(defaultOrgKitRoot(), 'organization/whink_group_leadership.json'), 'utf-8');
  const parsed = JSON.parse(raw) as { directorates?: Directorate[] };
  return Array.isArray(parsed.directorates) ? parsed.directorates : [];
}

export interface Director extends ReviewerRecord { directorate: string }

export async function pickCommittee(skillText: string): Promise<Director[]> {
  const [kit, directorates] = await Promise.all([getOrgKit(), loadDirectorates()]);
  const words = wordsOf(skillText);
  const scored = directorates.map((d) => {
    const terms = new Set<string>([...wordsOf(d.name), ...wordsOf(Object.keys(d.departments ?? {}).join(' '))]);
    for (const a of kit.agents) {
      if (a.directorate !== d.name) continue;
      for (const t of [...(a.skills ?? []), ...(a.responsibilities ?? [])]) for (const w of wordsOf(t.replace(/_/g, ' '))) terms.add(w);
    }
    const s = terms.size ? overlap(words, terms) / Math.sqrt(terms.size) : 0;
    return { d, s };
  });
  scored.sort((x, y) => y.s - x.s || (x.d.name < y.d.name ? -1 : x.d.name > y.d.name ? 1 : 0));
  const chosen: Directorate[] = scored.filter((x) => x.s > 0).slice(0, config.committeeSize).map((x) => x.d);
  for (const name of config.defaultCommitteeDirectorates) {
    if (chosen.length >= config.committeeSize) break;
    const d = directorates.find((x) => x.name === name);
    if (d && !chosen.includes(d)) chosen.push(d);
  }
  for (const x of scored) {
    if (chosen.length >= config.committeeSize) break;
    if (!chosen.includes(x.d)) chosen.push(x.d);
  }
  return chosen.slice(0, config.committeeSize).map((d) => ({
    id: `director.${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    directorate: oneLine(d.name, 120),
    name: oneLine(d.director, 80),
    title: `Director, ${oneLine(d.name, 120)}`,
    mission: oneLine(`Accountable for ${d.name}: ${Object.keys(d.departments ?? {}).slice(0, 8).join('; ')}`, 400),
  }));
}
