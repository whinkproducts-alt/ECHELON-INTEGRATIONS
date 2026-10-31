# ECHELON — OpenClaw capability integration contract
## Principle
The verified **KAMSI custom MCP gateway** under `services/openclaw` is not the same thing as upstream OpenClaw. Do not confuse the two and do not label unconnected upstream tooling as available. Preserve ECHELON governance as top-level authority.

## Capability selection
For each tool/skill/provider/browser/messaging/scheduler/sandbox capability, provide actual source versions, licenses and evidence, scoring reuse versus replace versus adapter integration. Only adopt if reliable improvement outweighs security and maintenance costs. Use stable adapters with reversible feature flags; no forked independent agent organization.

## Mandatory boundaries
- Canonical ECHELON task ID, approval ID, actor ID, allowed tools, data classification, budget, immutable audit correlation and expiry passed into each tool call.
- Deny by default. Agent persona cannot grant its own permissions.
- No uncontrolled outbound communication, purchased APIs, unrestricted browser commands or memory exfiltration.
- Local/cloud inference checked by one policy admission mechanism, all loops and background routes included.
- Failure returns truthful error/retry state; tools never directly set task success without verified receipt.
- Separate Founder-private Marcus/Kill Team data.
- Sandbox and network egress restrictions independently tested; don't assert upstream sandbox enabled without validation.
- Prefer existing execution engine and scheduler; OpenClaw adapter is not a second mission scheduler, budget ledger or organizational authority.
