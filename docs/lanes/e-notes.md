# Lane E notes (2026-11-16)
- Decision: one `org_cycle` daily system job (seed, score, open reviews, schedule training) instead of four jobs. Touches `lib/worker/roster.ts`, `lib/worker/jobs/index.ts` (lane A's paths) by one line each, plus `lib/__tests__/worker-scheduler.test.ts` counts (25 to 26).
- Decision: promotion approval by a non-founder approver is a gate the owner records, not a login by that person or agent (no agent may approve for Victor).
- Migration `20261116050000_lane_e_org` also creates `founder_ideas` and `initiatives` with IF NOT EXISTS: neither table had any migration (they existed only through db push), so a fresh database failed. Other lanes should not re-add them.
- Pre-existing, not mine: `lib/__tests__/marcus-proxy-exemption.test.ts:40` fails `tsc --noEmit`.
