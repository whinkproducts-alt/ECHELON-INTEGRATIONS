# Integration #2: Org-Tier Approval System — Architectural Plan

## Value Justification

Victor wants authority to explicitly descend through the organization:
agent → team_lead → dept_head → director → subsidiary_dir → wink_mamba → board → founder.
Only money/reputational/destructive risks reach Victor. Everything else is handled
internally at the appropriate tier. This governance layer ensures "authority goes down"
while keeping founder cognitive load minimal.

## Detailed Architectural Plan

### Phase 1: Org Tier Types and Definitions (2-A)

1. **Define `OrgTier` type** with 8 levels in `apps/web/lib/org-approval.ts`:
   - `founder` — Victor — only sees money/reputational/destructive
   - `wink_mamba` — Senior leadership — framework policy, not individual requests
   - `board` — Board of Directors — strategic pivots
   - `subsidiary_dir` — Subsidiary Director — regional patterns
   - `director` — Division Director — divisional policy
   - `dept_head` — Department Head — departmental boundaries
   - `team_lead` — Team Lead — team-level browsing
   - `agent` — Agent — operational execution (auto for C1, notified for C2+)

2. **Define `TierDefinition` interface** with authority levels:
   - `autoApproveClasses: Set<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'>`
   - `escalationClasses: Set<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'>`
   - `notifyOnlyClasses: Set<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'>`

3. **Map each tier to classes**:
   - `founder`: autoApprove = {A, B}; escalate = {}; notify = {}
   - `wink_mamba`: autoApprove = {A,B,C,D,E}; escalate = {F,G,H}; notify = {F}
   - `board`: autoApprove = {A,B,C,D,E,F}; escalate = {G,H}; notify = {G}
   - `subsidiary_dir`: autoApprove = {A,B,C,D,E}; escalate = {F,G,H}; notify = {F}
   - `director`: autoApprove = {A,B,C,D}; escalate = {E,F,G,H}; notify = {D}
   - `dept_head`: autoApprove = {A,B,C}; escalate = {D,E,F,G,H}; notify = {C}
   - `team_lead`: autoApprove = {A,B}; escalate = {C,D,E,F,G,H}; notify = {B}
   - `agent`: autoApprove = {A}; escalate = {B,C,D,E,F,G,H}; notify = {}

4. **Define `BrowserApprovalClass`** (C1–C7 + H):
   - `C1` — URL whitelist auto-allow (agent tier)
   - `C2` — Team lead notify, agent proceeds (team_lead tier)
   - `C3` — Cross-team domain approval (dept_head tier)
   - `C4` — Director approval (director tier)
   - `C5` — Subsidiary Director approval (subsidiary_dir tier)
   - `C6` — Wink/Mamba approval (wink_mamba tier)
   - `C7` — Board approval (board tier)
   - `H` — Founder only (money/reputational/destructive)

5. **Write `classifyBrowserApproval(url, context)`** decision function:
   - First check: if money/reputational/destructive → class H
   - Then: if URL on whitelist → class C1
   - Then: tier-based logic descending from agent upward
   - Default fallback: C2 team lead notify

### Phase 2: Permission Engine Integration (2-B)

1. **Extend `lib/permission-engine.ts` `checkPermission()`** with `orgContext` parameter:
   - Add `requesterTier?: OrgTier` to ctx parameter
   - Add `requesterRoleId?: string` to ctx parameter
   - Add `missionId?: string` to ctx parameter

2. **Add tier-based auto-approval logic for non-agent tiers**:
   - If requesterTier is not 'agent', allow approval at that tier's level
   - Use `TIER_DEFINITIONS` to determine autoApproveClasses vs escalation

3. **Add escalation logic**: when requester tier cannot approve, escalate to tier above
   - If tier's autoApproveClasses doesn't cover the class → escalate
   - If class in tier's escalationClasses → send to tier above
   - Chain: agent → team_lead → dept_head → director → subsidiary_dir → wink_mamba → board → founder

3. **Add founder-only visibility filter for `H` class approvals**:
   - In approval request routing, filter: only founder-tier approvals visible to Victor
   - Other tiers see only their own tier's approvals
   - Dashboard filter: `visibleToFounder = (tier === 'founder')`

4. **Ensure existing tests still pass** (backward compatible):
   - Run `pnpm build`, `pnpm test` after changes
   - No test breakage (2345 tests green)

### Phase 3: Approval Request Creation (2-C)

1. **Implement `createBrowserApproval(params)`** in `org-approval.ts`:
   - `BrowserApprovalParams` interface: userId, agentId?, toolName, args, classification, correlationId?
   - Creates approval request routed to appropriate org tier
   - Records in ledger with `kind: 'tool_call'`, `tool: toolName`

2. **Create approval request records** scoped by `userId` + `requesterTier`:
   - Table: `approvalRequests` with columns: id, userId, kind, tool, params, tier, status, decidedAt, expiresAt, contentHash

3. **Route approvals to appropriate tier** based on `classification.requiresApprovalFrom`:
   - If `requiresApprovalFrom: 'dept_head'` → route to dept_head approval queue
   - If `requiresApprovalFrom: 'founder'` → route to Victor's dashboard only
   - Auto-approval for C1 (whitelist), C2 (team lead notify-proceed)

4. **Victor only sees `H` class approvals** in his dashboard:
   - Dashboard filter: `WHERE class = 'H' AND tier = 'founder'`
   - All other approvals handled internally by org tiers

5. **Add notification system** for team leads/department heads:
   - When C2 classification → notify team lead (but agent proceeds)
   - When C3+ classification → notify appropriate tier, await approval
   - Notification channels: in-app, email, or ledger audit

### Phase 4: Escalation Workflow (2-D)

1. **Define escalation chain**: agent → team_lead → dept_head → director → subsidiary_dir → wink_mamba → board → founder

2. **Implement timeout-based escalation**:
   - Each approval request has `expiresAt` timestamp
   - If tier doesn't approve before `expiresAt` → escalate to next tier up
   - Configurable timeout per tier (e.g., team_lead: 5min, dept_head: 15min, director: 30min)

3. **Add audit trail** for every approval/denial decision:
   - Log: who approved, when, what tool, what class, what reason
   - Immutable record in ledger for compliance

4. **Add rollback capability** for mistakenly approved actions:
   - If approval was given in error → can be rolled back by the approving tier
   - Audit log captures who rolled back and when
   - May require founder approval for destructive rollbacks

### Deliverables

- [ ] `apps/web/lib/org-approval.ts` with complete org-tier types + definitions
- [ ] `TierDefinition` record mapping all 8 tiers to auto/escalate/notify classes
- [ ] `classifyBrowserApproval()` decision function
- [ ] `createBrowserApproval()` approval request creation
- [ ] `checkBrowserPermission()` extension in `permission-engine.ts` with orgContext
- [ ] Approval request routing by tier
- [ ] Founder-only dashboard filter for `H` class
- [ ] Escalation workflow with timeouts
- [ ] Audit trail for all approval decisions
- [ ] Documentation in `docs/ORG_TIER_APPROVAL.md`
- [ ] All 2345 tests still pass (backward compatible)

### Testing Criteria

- [ ] OrgTier type has all 8 levels defined
- [ ] TIER_DEFINITIONS has correct auto/escalate/notify sets per tier
- [ ] classifyBrowserApproval() correctly maps URLs to C1–C7 + H classes
- [ ] checkPermission() with orgContext respects tier boundaries
- [ ] createBrowserApproval() routes to correct tier
- [ ] Founder dashboard only shows H class approvals
- [ ] Escalation chain works: agent → team_lead → dept_head → director → founder
- [ ] All 2345 existing tests pass
- [ ] No regressions in Class C gate behavior