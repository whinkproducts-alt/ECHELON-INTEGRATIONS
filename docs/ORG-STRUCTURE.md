# ECHELON organisation structure with reporting lines (draft 2026-11-15)

Generated from `packages/org-kit/organization/whink_group_leadership.json` and `workforce_registry.json`. Nothing here is invented: names come from those files. Rows marked **UNKNOWN** need your answer.

## Levels

| Level | Who | Reports to | Source |
|---|---|---|---|
| 0 | Victor Igboekwe, Founder, Chairman | none | leadership file |
| 1 | WHINK (CEO persona), MAMBA (Consigliere, peer persona), Marcus Vale (private executive assistant, sealed founder scope) | Victor | leadership file, `personas.ts` |
| 1 | Board members | Victor | `BOARD_MEMBERS` in `personas.ts` lists WHINK, MAMBA and Amara. **UNKNOWN: full board list** |
| 1 | Kill team members | Victor (sealed scope) | **UNKNOWN: names and roles** (code mentions Marcus, Tunde, Peter, Paul in a comment only) |
| 2 | Subsidiary heads, 5 subsidiaries (consult, real-estate, trades, apps, frontliners) | Victor, reviewed by WHINK and MAMBA twice a year | **UNKNOWN: names**. `subsidiaries.json` has no heads |
| 2 | Directorate heads, 15 | WHINK (CEO), then Victor | leadership file |
| 3 | Department heads, 126 | their directorate head | leadership file |
| 4 | Agents, 326: "Principal Specialist" then "Analyst & Reviewer" in each department | their department head (`reports_to_human`) | registry |

**Two-level approval chain for any promotion:** the person's manager, then that manager's manager. Agent → department head + directorate head. Department head → directorate head + WHINK. Directorate head → WHINK + Victor. Subsidiary head, board member, kill team member → Victor, with the WHINK and MAMBA review attached.

## Directorates

| Directorate | Head | Departments | Agents |
|---|---|---|---|
| Executive Office & Corporate Strategy | Dr. Tinaye Muzenyi-Igboekwe | 6 | 12 |
| WHINK Group Marketing Intelligence | Tai Tamminga | 2 | 78 |
| Sales & Revenue | Juliet Uchechukwu Igboekwe (JP) | 7 | 14 |
| Product | Atika Emmanuel | 7 | 14 |
| Engineering & Technology | Luke Mellors | 10 | 20 |
| Data & Artificial Intelligence | Dr. Amara Okafor | 12 | 24 |
| Research & Development | Dr. Elena Varga | 10 | 20 |
| Information Technology | Alejandro Ruiz | 10 | 20 |
| Cybersecurity & Resilience | Anthony C Igboekwe | 12 | 24 |
| Finance & Accounting | Charles Soludo | 8 | 16 |
| Legal, Risk & Governance | Genevieve Igboekwe | 9 | 18 |
| People & Culture | Victoria Ngozi Igboekwe | 10 | 20 |
| Operations & Procurement | Bruno Fernades | 8 | 16 |
| Customer Organization | Zaleena BeeHarry | 8 | 16 |
| Internal Audit & Assurance | Francis Lampard | 7 | 14 |
| **Total** | | **126** | **326** |

## Problems found in the data

- **Lopsided Marketing:** WHINK Group Marketing Intelligence has 2 departments but 78 agents; Brand, Media & Audience Intelligence has 46 and Commercial & Growth Marketing Intelligence has 32. Every other department has 2 or 3. Likely a data entry error; needs your check before anyone is scored.
- **Everyone is dormant:** all 326 agents are `dormant` at autonomy level 2. A dormant agent does no work, so it has nothing to score. Activation comes first.
- **No agent-to-agent chain:** agents report to a named person. Inside a department, "Analyst & Reviewer" should report to the "Principal Specialist"; the registry doesn't say so.
- **Are the 141 named heads real people?** The leadership file lists directors and department heads by name, and the staff directory marks entries `human` or `agent`. If they are real people, a promotion "approved by their manager" needs that person, not an AI.
