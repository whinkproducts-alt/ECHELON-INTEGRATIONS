# ECHELON organisation structure with reporting lines (draft 2026-11-15)

Generated from `packages/org-kit/organization/whink_group_leadership.json` and `workforce_registry.json`. Nothing here is invented: names come from those files. Rows marked **UNKNOWN** need your answer.

## Levels

| Level | Who | Reports to | Source |
|---|---|---|---|
| 0 | Victor Igboekwe, Founder, Chairman | none | leadership file |
| 1 | WHINK (CEO persona), MAMBA (Consigliere, peer persona), Marcus Vale (private executive assistant, sealed founder scope) | Victor | leadership file, `personas.ts` |
| 1 | Board members | Victor | `BOARD_MEMBERS` in `personas.ts` lists WHINK, MAMBA and Amara. full board in the roster section below |
| 1 | Kill team members | Victor (sealed scope) | 5 members, see roster section |
| 2 | Subsidiary heads, 5 subsidiaries (consult, real-estate, trades, apps, frontliners) | Victor, reviewed by WHINK and MAMBA twice a year | named in the roster section |
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

- **(Withdrawn, see roster) Lopsided Marketing:** WHINK Group Marketing Intelligence has 2 departments but 78 agents; Brand, Media & Audience Intelligence has 46 and Commercial & Growth Marketing Intelligence has 32. Every other department has 2 or 3. Likely a data entry error; needs your check before anyone is scored.
- **Everyone is dormant:** all 326 agents are `dormant` at autonomy level 2. A dormant agent does no work, so it has nothing to score. Activation comes first.
- **No agent-to-agent chain:** agents report to a named person. Inside a department, "Analyst & Reviewer" should report to the "Principal Specialist"; the registry doesn't say so.
- **Are the 141 named heads real people?** The leadership file lists directors and department heads by name, and the staff directory marks entries `human` or `agent`. If they are real people, a promotion "approved by their manager" needs that person, not an AI.

## Roster of record (WHINK Group Roster, locked 2026-11-15)

Source: `docs/product/Whink-Group-Roster.html`, supplied by Victor. **Where it differs from the org-kit JSON files, the roster wins**; the JSON files need updating to match (backlog item 56).

**Board of 8:** Victor Igboekwe (Founder & Chairman), Anthony Igboekwe (MD Apps), Juliet Igboekwe (MD Trades & Investments), Dr Tinaye Lydia Muzenyi (MD Frontliners, Exec Director D01), Genevieve Igboekwe (Chief Legal Counsel, Director D11), Marcus Vale (Chief Exec Assistant, D01 department head), plus WHINK (Chief of Staff) and MAMBA (Chief Exec Operating Officer / Consigliere) as AI board members.

**Subsidiary heads (MDs):** Consult: Victor Igboekwe. Apps: Anthony Igboekwe. Trades & Investments: Juliet Igboekwe. Frontliners: Dr Tinaye Lydia Muzenyi. Real Estate: Whitney Brown.

**Kill team (ECHELON):** PETER (Principal Reverse Engineer), PAUL (Principal Reconstruction Engineer), MICAH (Principal Product Auditor), NANDI (Growth, Marketing & Revenue Strategist), SCOUT / Michael Carrick (Master Researcher & Opportunity Scout).

**16 directorates, director then department count:** D01 Executive Office, Dr Tinaye Lydia Muzenyi, 8 · D02 Marketing Intelligence, Tai Tamminga, 2 (39 teams) · D03 Sales & Revenue, Ijie Alpha, 7 · D04 Product, Atika Emmanuel, 7 · D05 Engineering, Luke Mellors, 10 · D06 Data & AI, Dr Amara Okafor, 12 · D07 R&D, Dr Elena Varga, 10 · D08 IT, Alejandro Ruiz, 10 · D09 Cybersecurity, Marcus Lund, 12 · D10 Finance, Charles Soludo, 8 · D11 Legal, Genevieve Igboekwe, 9 · D12 People & Culture, Nneka Eze, 9 · D13 Operations & Procurement, Bruno Fernades, 8 · D14 Customer, Zaleena BeeHarry, 8 · D15 Internal Audit, Francis Lampard, 7 · D16 AI Organization & Autonomous Operations, Chukwuemezue VJ Igboekwe, 5. Counted 132 departments (roster header says ~131). Each department has a head and a team lead; the full names are in the roster file.

### Differences from the JSON files
- **D16 is missing** from the JSON (15 directorates there).
- **Directors differ:** Sales (JSON: Juliet Igboekwe; roster: Ijie Alpha), Cybersecurity (Anthony Igboekwe; Marcus Lund), People & Culture (Victoria Ngozi Igboekwe; Nneka Eze).
- **Department counts differ:** Executive Office 8 vs 6 in JSON; People & Culture 9 vs 10; Marketing 2 in both.
- **Marketing "78 agents" is not a data error.** The roster shows 2 departments holding 39 named teams (23 + 16). The JSON's 78 agents are those teams at 2 agents each. The earlier "lopsided" warning is withdrawn.
- **Marcus Vale is a board member and D01 department head**, so his reporting line is Victor as board member, Dr Tinaye as department head. Needs your ruling on which line governs promotion.
- **Roster agent count is ~338** vs 326 in the registry (12 short).

### Still open
- Are directors and department heads real people or personas? The roster lists human-style names throughout.
- Several people hold two roles (Victor and the MDs are also board; Genevieve is board and D11 director). Promotion approval needs a rule for who signs when manager and manager's manager are the same person.

### Decisions (Victor, 2026-11-15)
- **AI or human makes no difference to the chain.** The same two-level approval applies to a person and to an AI persona. Consequence: an approval is recorded against a named role, and only that named person (or their persona) can give it.
- **Marcus Vale:** WHINK sets his KPIs. Victor does his appraisal and alone decides his promotion and any pay rise. This is a single-approver exception to the two-level rule.

### Org-kit files updated to the roster (same day)
`whink_group_leadership.json` and `.yaml` now hold 16 directorates, 132 departments, department heads and team leads, the board of 8, the 5 subsidiary heads and the 5-member kill team. 60 agents now report to the roster's department head, and the 2 agents (1 team) in HR Business Partnering moved from People & Culture to Executive Office. Existing department names were kept where the roster only abbreviates them, so agent ids and routing are unchanged.
**Added (same day):** 10 agents and 5 teams for D16, so the registry now holds 336 agents and 168 teams. Principal Specialists use the roster's team-lead names; the five Analyst & Reviewer names are placeholders I chose, not from the roster. **Still missing:** agents for the new D01 department "People Operations & HR Strategy" (2 more would reach the roster's ~338).
