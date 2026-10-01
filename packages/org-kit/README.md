# WHINK Group Portable AI Organization Kit v2

## What this package now does
This version contains an executable reference architecture for:
- 15 directorates
- 126 departments
- 163 teams
- 326 dormant-by-default named AI agents
- 570 reusable skills
- company-wide reuse-first workforce selection
- mandatory human approval gating
- provider-neutral routing
- provider adapter templates
- tool capability contracts

## Fastest chat use
Attach `WHINK_PORTABLE_CHAT_BOOTSTRAP.md` using the chat UI's `+` / attach-file control.
For full fidelity, also attach the ZIP or the registries if the platform can inspect archives.

Say:
`Load WHINK Group.`

Then give WHINK a task.

The AI should NOT execute immediately. It should first propose the smallest competent team and present an Execution Authorization Request with team size, schedule, and estimated budget. Work begins only after human approval.

## Important
A chat attachment can provide instructions and registries, but it cannot by itself force every AI product to support autonomous multi-agent execution. Platforms vary. The package therefore includes a portable routing/reference layer and provider adapters. Where a platform supports only one model conversation, it should emulate the roles sequentially. Where a platform supports agents/tools, the adapter can execute them as separate workers.

## Source of truth
WHINK core definitions are provider-neutral. Provider-specific APIs, model names, and current prices belong only in `/providers/`.
