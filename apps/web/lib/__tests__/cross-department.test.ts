import { describe, it, expect } from 'vitest';
import { buildAuthorizationRequest } from '@whink/org-kit';
import { KEYWORD_SKILL_MAP, extractRequiredSkills } from '@/lib/task-gate';
import { getOrgKit } from '@/lib/agent-loader';
import { admittedAgents } from '@/lib/worker/ear-execution';
import { classifyProtected } from '@/lib/protected-actions';
import { SUBSIDIARY_IDS } from '@/lib/subsidiaries';
import { matchDirectorate, parseSubsidiaries, subsidiaryContext } from '@/lib/marcus/routing';

const eligible = (a: { permissions: string[]; state: string }) => a.permissions.includes('draft') && !['suspended', 'retired'].includes(a.state);

describe('skills the task gate asks for exist', () => {
  it('every mapped skill has at least one eligible agent, so a request never fails on an invented skill name', async () => {
    const { agents } = await getOrgKit();
    for (const { skill } of KEYWORD_SKILL_MAP) {
      expect(agents.filter((a) => a.skills.includes(skill) && eligible(a)).length, skill).toBeGreaterThan(0);
    }
  });
});

describe('a request across departments', () => {
  const ASK = 'Plan the product launch with a sales forecast, a legal and compliance review, a budget and recruiting a contractor';

  it('collects one skill per domain and forms a complete team across several directorates', async () => {
    const skills = extractRequiredSkills(ASK);
    for (const s of ['product_strategy', 'sales_enablement', 'regulatory_compliance', 'budgeting', 'recruiting']) expect(skills, s).toContain(s);
    const ear = buildAuthorizationRequest(ASK, skills, { maxAgents: 5 });
    ear.execution_scope = 'internal_analysis';
    expect(ear.capability_gaps).toEqual([]);
    const { agents } = await getOrgKit();
    const team = admittedAgents(ear, agents); // the executor's own admission check
    expect(new Set(team.map((a) => a.directorate)).size).toBeGreaterThanOrEqual(3);
  });

  it('a target directorate steers which agent leads when a skill is held in several directorates', async () => {
    const { agents } = await getOrgKit();
    const bySkill = new Map<string, typeof agents>();
    for (const a of agents.filter(eligible)) for (const sk of a.skills) if (sk !== 'web_research' && sk !== 'quality_review' && sk !== 'source_verification') bySkill.set(sk, [...(bySkill.get(sk) ?? []), a]);
    const shared = [...bySkill].filter(([, v]) => new Set(v.map((a) => a.directorate)).size >= 2);
    expect(shared.length, 'needs a skill held in two directorates for this test to mean anything').toBeGreaterThan(0);
    for (const [skill, holders] of shared) {
      for (const dir of new Set(holders.map((a) => a.directorate))) {
        const lead = buildAuthorizationRequest('Draft a plan', [skill], { maxAgents: 1, targetDirectorate: dir }).lead_agent;
        expect(holders.find((a) => a.name === lead)?.directorate, `${skill} steered to ${dir}`).toBe(dir);
      }
    }
  });

  it('matches common word forms, not only the bare keyword', () => {
    expect(extractRequiredSkills('We are recruiting two people and need the budgets and forecasts')).toEqual(expect.arrayContaining(['recruiting', 'budgeting']));
    expect(extractRequiredSkills('Review the contracts and the compliance position')).toContain('regulatory_compliance');
    expect(extractRequiredSkills('How are our customers and partners doing')).toEqual(expect.arrayContaining(['customer_success', 'partner_enablement']));
    expect(extractRequiredSkills('Say hello to the team')).toEqual([]);
  });
});

describe('subsidiaries', () => {
  it('naming any subsidiary pair in a request is not mistaken for a protected trade or payment', () => {
    for (const a of SUBSIDIARY_IDS) for (const b of SUBSIDIARY_IDS) {
      const ctx = subsidiaryContext({ subsidiary: a, targets: [b] });
      const c = classifyProtected({ toolName: 'ear_objective', description: `${ctx}Draft a joint plan for next quarter` });
      expect(c.protected, ctx).toBe(false);
    }
  });

  it('accepts real ids only and caps the target list', () => {
    expect(parseSubsidiaries('consult', ['trades', 'apps'])).toEqual({ ok: true, value: { subsidiary: 'consult', targets: ['trades', 'apps'] } });
    expect(parseSubsidiaries(undefined, undefined)).toEqual({ ok: true, value: { subsidiary: null, targets: [] } });
    expect(parseSubsidiaries('consult', ['trades', 'trades'])).toEqual({ ok: true, value: { subsidiary: 'consult', targets: ['trades'] } });
    expect(parseSubsidiaries('nope', [])).toMatchObject({ ok: false });
    expect(parseSubsidiaries('consult', ['trades', 'bogus'])).toMatchObject({ ok: false });
    expect(parseSubsidiaries('consult', 'trades')).toMatchObject({ ok: false });
    expect(parseSubsidiaries('consult', ['consult', 'trades', 'apps', 'frontliners', 'real-estate'])).toMatchObject({ ok: false });
  });

  it('writes the context from config names, never from the request text', () => {
    expect(subsidiaryContext({ subsidiary: null, targets: [] })).toBe('');
    expect(subsidiaryContext({ subsidiary: 'consult', targets: [] })).toBe('For Whink Consult: ');
    expect(subsidiaryContext({ subsidiary: 'consult', targets: ['apps', 'consult'] })).toBe('For Whink Consult, with Whink Apps: ');
    expect(subsidiaryContext({ subsidiary: null, targets: ['apps'] })).toBe('Across subsidiaries, with Whink Apps: ');
  });
});

describe('directorate text from Marcus', () => {
  const names = ['Finance & Accounting', 'Legal, Risk & Governance', 'Operations & Procurement', 'Product', 'Sales & Revenue'];
  it('matches exact and unique partial names, and treats anything else as no preference', () => {
    expect(matchDirectorate('finance & accounting', names)).toBe('Finance & Accounting');
    expect(matchDirectorate('finance', names)).toBe('Finance & Accounting');
    expect(matchDirectorate('legal', names)).toBe('Legal, Risk & Governance');
    expect(matchDirectorate('ops', names)).toBeNull(); // too short and not a name
    expect(matchDirectorate('and', names)).toBeNull(); // ambiguous
    expect(matchDirectorate('', names)).toBeNull();
    expect(matchDirectorate(null, names)).toBeNull();
    expect(matchDirectorate('<script>', names)).toBeNull();
  });
});
