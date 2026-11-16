/**
 * Org graph built from packages/org-kit (never typed by hand). Pure: no database.
 * Rules: one manager per entity, no loops, depth capped, everyone but the founder has a manager.
 */
import { readFileSync } from 'fs';
import path from 'path';

export const FOUNDER_KEY = 'victor-igboekwe';
export const MAX_DEPTH = 8;

export interface OrgNode {
  key: string;
  kind: 'human' | 'persona' | 'agent';
  name: string;
  role: string;
  tier: 0 | 1 | 2 | 3 | 4;
  directorate: string | null;
  department: string | null;
  managerKey: string | null;
  roles: string[];
}

export const slug = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

interface Leadership {
  directorates: { name: string; director: string; departments: Record<string, string> }[];
  board: { name: string; role: string }[];
  subsidiary_heads: { subsidiary: string; name: string; role: string }[];
  kill_team: { codename: string; name: string; role: string }[];
}
interface Agent { agent_id: string; name: string; title: string; directorate: string; department: string; reports_to_human: string }

export function loadOrgKit(root = process.env.ORG_KIT_PATH ? path.resolve(process.env.ORG_KIT_PATH) : path.resolve(process.cwd(), '../../packages/org-kit')) {
  const rd = <T>(f: string) => JSON.parse(readFileSync(path.join(root, 'organization', f), 'utf-8')) as T;
  return { leadership: rd<Leadership>('whink_group_leadership.json'), agents: rd<Agent[]>('workforce_registry.json') };
}

/** A person keeps the highest tier among their roles; their manager follows that tier. */
export function buildOrg(kit = loadOrgKit()): OrgNode[] {
  const { leadership: L, agents } = kit;
  const m = new Map<string, OrgNode>();
  const put = (n: Omit<OrgNode, 'roles'> & { addRole: string }) => {
    const cur = m.get(n.key);
    const { addRole, ...rest } = n;
    if (!cur) { m.set(n.key, { ...rest, roles: [addRole] }); return; }
    if (!cur.roles.includes(addRole)) cur.roles.push(addRole);
    if (rest.tier < cur.tier) m.set(n.key, { ...cur, ...rest, roles: cur.roles });
  };

  put({ key: FOUNDER_KEY, kind: 'human', name: 'Victor Igboekwe', role: 'Founder & Chairman', tier: 0, directorate: null, department: null, managerKey: null, addRole: 'Founder & Chairman' });
  for (const p of ['WHINK', 'MAMBA']) {
    put({ key: slug(p), kind: 'persona', name: p, role: p === 'WHINK' ? 'Chief of Staff' : 'Chief Executive Operating Officer / Consigliere', tier: 1, directorate: null, department: null, managerKey: FOUNDER_KEY, addRole: 'AI board member' });
  }
  for (const b of L.board) {
    if (slug(b.name) === FOUNDER_KEY || ['whink', 'mamba'].includes(slug(b.name))) continue;
    put({ key: slug(b.name), kind: slug(b.name) === 'marcus-vale' ? 'persona' : 'human', name: b.name, role: b.role, tier: 1, directorate: null, department: null, managerKey: FOUNDER_KEY, addRole: b.role });
  }
  for (const k of L.kill_team) {
    put({ key: slug(k.codename), kind: 'persona', name: k.codename === 'SCOUT' ? `${k.name} (SCOUT)` : k.codename, role: k.role, tier: 1, directorate: null, department: null, managerKey: FOUNDER_KEY, addRole: `Kill team: ${k.role}` });
  }
  for (const s of L.subsidiary_heads) {
    put({ key: slug(s.name), kind: 'human', name: s.name, role: s.role, tier: 2, directorate: null, department: null, managerKey: FOUNDER_KEY, addRole: `Subsidiary head: ${s.subsidiary}` });
  }
  const directorKey = new Map<string, string>();
  for (const d of L.directorates) {
    directorKey.set(d.name, slug(d.director));
    put({ key: slug(d.director), kind: 'human', name: d.director, role: `Director, ${d.name}`, tier: 2, directorate: d.name, department: null, managerKey: 'whink', addRole: `Director: ${d.name}` });
  }
  for (const d of L.directorates) {
    for (const [dept, head] of Object.entries(d.departments)) {
      put({ key: slug(head), kind: 'human', name: head, role: `Head, ${dept}`, tier: 3, directorate: d.name, department: dept, managerKey: slug(d.director), addRole: `Department head: ${dept}` });
    }
  }
  const nodes = [...m.values()];
  // Persons who are also a higher tier keep that tier's manager; fix a self-manager created by a director heading a department in their own directorate.
  for (const n of nodes) if (n.managerKey === n.key) n.managerKey = n.tier >= 3 ? 'whink' : FOUNDER_KEY;
  for (const a of agents) {
    nodes.push({ key: a.agent_id, kind: 'agent', name: a.name, role: a.title, tier: 4, directorate: a.directorate, department: a.department, managerKey: slug(a.reports_to_human), roles: [a.title] });
  }
  return nodes;
}

export function validateOrg(nodes: OrgNode[]): string[] {
  const errs: string[] = [];
  const byKey = new Map<string, OrgNode>();
  for (const n of nodes) { if (byKey.has(n.key)) errs.push(`duplicate key ${n.key}`); byKey.set(n.key, n); }
  for (const n of nodes) {
    if (n.key === FOUNDER_KEY) { if (n.managerKey) errs.push('founder has a manager'); continue; }
    if (!n.managerKey) { errs.push(`${n.key} has no manager`); continue; }
    if (!byKey.has(n.managerKey)) { errs.push(`${n.key}: manager ${n.managerKey} not found`); continue; }
    let depth = 0; const seen = new Set<string>([n.key]);
    for (let c = byKey.get(n.managerKey); c; c = c.managerKey ? byKey.get(c.managerKey) : undefined) {
      if (seen.has(c.key)) { errs.push(`loop at ${n.key}`); break; }
      seen.add(c.key);
      if (++depth > MAX_DEPTH) { errs.push(`${n.key} deeper than ${MAX_DEPTH}`); break; }
    }
  }
  return errs;
}

/**
 * Who must approve a promotion: line manager, then that manager's manager.
 * Marcus Vale: the founder alone. Anything that changes access also needs the founder.
 */
export function approvalChain(nodes: OrgNode[], entityKey: string, changesAccess = false): string[] {
  if (entityKey === 'marcus-vale') return [FOUNDER_KEY];
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const e = byKey.get(entityKey);
  if (!e || !e.managerKey) return [];
  const chain: string[] = [e.managerKey];
  const mgr = byKey.get(e.managerKey);
  if (mgr?.managerKey) chain.push(mgr.managerKey);
  if (changesAccess) chain.push(FOUNDER_KEY);
  return [...new Set(chain)];
}
