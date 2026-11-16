# Lane H notes (execution)

- **Spawn rule:** only `lib/exec-runner.ts` starts processes (plus the reviewed read-only git tool). Callers: `lib/exec-backend.ts`, `lib/remote/ssh.ts`. `exec-spawn-audit.test.ts` enforces this.
- **Gate:** `lib/exec-gate.ts`: Class B via `checkPermission`, Class C via `checkApprovedAction` with `approvalContentHash({kind:'tool_call', tool, params})`. Capabilities: `exec_command_local`, `exec_command_docker`, `browser_read`, `browser_write`, `remote_ssh`, `remote_cloud_sandbox`. Unregistered in `CAPABILITY_CLASSES`, so they default to C; `browser_read` and allow-listed B actions call `checkPermission(..., 'B')` directly. Lane G1a/lead: register these in the tool registry and the approval executor so `decide` can run them after approval (not done: outside lane H files).
- **D9 amendment (for the lead, CLAUDE.md is not mine):** "No scraping or browser automation library in app or gateway dependencies, except one local, non-stealth, Apache-2.0 browser driver (`playwright-core`) used only by `lib/browser`, never for stealth, CAPTCHA bypass or fingerprint spoofing."
- **Licence:** `playwright-core` is Apache-2.0 (Microsoft). Not added to package.json; loaded lazily by `lib/browser/playwright-driver.ts`.
- **R14 option C** (sandbox writes as Class B) not applied: commands stay Class B only when allow-listed read-only, even in Docker. Say if you want writes inside the sandbox to be B.
- **Shortcut:** on timeout the docker CLI is killed but the container relies on `--rm`, memory and pid limits.
