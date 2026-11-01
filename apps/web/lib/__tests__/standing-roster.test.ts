import { describe, it, expect } from 'vitest';
import { loadOrgKitSync } from '../agent-loader';
import { STAFF_DIRECTORY } from '../staff-directory';
import { SUBSIDIARY_IDS } from '../subsidiaries';
import { getRoster, rosterStats, estimateDailyModelCalls, RosterSchema, JOB_TYPES } from '../worker/roster';
import { parseInterval, backoffMs } from '../worker/schedule';
import { WORKER_CAPABILITIES, assertWorkerCapability } from '../worker/context';
import { classifyProtected } from '../protected-actions';
import { capabilityClass } from '../permission-engine';
import raw from '../../config/standing-roster.json';

const roster = getRoster();
const by = (g: string) => roster.filter((e) => e.group === g);

describe('standing roster', () => {
  it('has 28 entries with the requested group sizes', () => {
    expect(roster).toHaveLength(28);
    expect(by('innovation_committee')).toHaveLength(5);
    expect(by('news_desk')).toHaveLength(6);
    expect(by('subsidiary_monitor')).toHaveLength(5);
    expect(by('security_watch')).toHaveLength(3);
    expect(by('memory_curation')).toHaveLength(2);
    expect(by('executive_office')).toHaveLength(3);
    expect(by('operations')).toHaveLength(2);
    expect(by('finance_watch')).toHaveLength(1);
    expect(by('legal_compliance_watch')).toHaveLength(1);
  });

  it('every agent id exists in the org-kit; every persona id exists in the staff directory', () => {
    const kit = loadOrgKitSync();
    const agentIds = new Set(kit.agents.map((a) => a.agent_id));
    const staff = new Set(STAFF_DIRECTORY.map((s) => s.id));
    for (const e of roster) {
      if (e.kind === 'agent') {
        expect(agentIds.has(e.agentId), `${e.key} ${e.agentId}`).toBe(true);
        const a = kit.agents.find((x) => x.agent_id === e.agentId)!;
        expect(a.name).toBe(e.name);
      } else {
        expect(staff.has(e.agentId), e.agentId).toBe(true);
      }
    }
  });

  it('the five committee personas are flagged persona (no org-kit agent carries those names)', () => {
    const kit = loadOrgKitSync();
    const names = new Set(kit.agents.map((a) => a.name));
    const committee = by('innovation_committee');
    expect(committee.map((e) => e.name).sort()).toEqual(['Amara Okafor', 'Mateo Restrepo', 'Mei-Ling Tan', 'Priya Raghunathan', "Soren O'Connell"]);
    for (const e of committee) { expect(e.kind).toBe('persona'); expect(names.has(e.name)).toBe(false); }
  });

  it('subsidiary monitors cover exactly the five subsidiary ids', () => {
    expect(by('subsidiary_monitor').map((e) => e.params.subsidiary).sort()).toEqual([...SUBSIDIARY_IDS].sort());
  });

  it('keys and agent ids are unique, schedules parse, enabled entries have a job', () => {
    expect(new Set(roster.map((e) => e.key)).size).toBe(28);
    expect(new Set(roster.map((e) => e.agentId)).size).toBe(28);
    for (const e of roster) { expect(parseInterval(e.schedule)).not.toBeNull(); if (e.enabled) expect(e.job).not.toBeNull(); }
    expect(() => RosterSchema.parse({ ...raw, roster: [...raw.roster, raw.roster[0]] })).toThrow();
  });

  it('counts enabled entries and estimates daily model calls from the schedules', () => {
    expect(rosterStats()).toEqual({ size: 28, enabled: 21 });
    const est = estimateDailyModelCalls();
    expect(est.perJob.news_digest).toBe(288);
    expect(est.perJob.opportunity_scan).toBe(34);
    expect(est.total).toBeCloseTo(322.14, 1);
  });

  it('parses intervals and backs off exponentially with a cap', () => {
    expect(parseInterval('every 30m')).toBe(1_800_000);
    expect(parseInterval('every 7d')).toBe(604_800_000);
    expect(parseInterval('weekly')).toBeNull();
    expect(parseInterval('every 0m')).toBeNull();
    expect(backoffMs(60_000, 0)).toBe(60_000);
    expect(backoffMs(60_000, 3)).toBe(480_000);
    expect(backoffMs(60_000, 20)).toBe(6 * 3_600_000);
  });

  it('job types in the roster are all known', () => {
    for (const e of roster) if (e.job) expect(JOB_TYPES).toContain(e.job);
  });
});

describe('worker capabilities', () => {
  it('are Class A and not protected', () => {
    for (const c of WORKER_CAPABILITIES) {
      expect(capabilityClass(c)).toBe('A');
      expect(classifyProtected({ toolName: c, capability: c }).protected).toBe(false);
      expect(() => assertWorkerCapability(c)).not.toThrow();
    }
  });
  it('anything else is refused, including outbound and money names', () => {
    for (const c of ['send_email', 'social_post', 'transfer_funds', 'memory_write', 'openclaw__x__post']) {
      expect(() => assertWorkerCapability(c)).toThrow();
    }
  });
});
