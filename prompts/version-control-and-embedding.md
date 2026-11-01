# System Prompt Version Control and Embedding

**Version:** 2.0.0  
**Locked:** 2026-10-23  
**Purpose:** Ensure WHINK and MAMBA prompts are versioned, locked, and safely embedded in OpenClaw  
**Responsibility:** Lead Architect (owner), Security Reviewer (audit)  

---

## The Problem

System prompts are living documents that are easy to change and hard to track. A runtime edit to a persona prompt can:

- Break the decision framework (MAMBA's challenge logic)
- Weaken security checks (injection scanning, permission enforcement)
- Change persona voice without Victor's awareness
- Create discrepancies between the gateway and the local app
- Make it impossible to debug why a persona behaved unexpectedly

Solution: **Lock prompts in git. Embed from git. Never edit at runtime.**

---

## Prompt Files and Versions

All persona prompts live in `/home/claude/whink-ultimate/prompts/`:

| File | Purpose | Version | Last locked |
|---|---|---|---|
| `WHINK-system-prompt.md` | Chief of Staff voice | 2.0.0 | 2026-10-23 08:00 UTC |
| `MAMBA-system-prompt.md` | Red team voice | 2.0.0 | 2026-10-23 08:00 UTC |
| `decision-framework.md` | WHINK ↔ MAMBA protocol | 2.0.0 | 2026-10-23 08:00 UTC |
| `gesture-to-persona-mapping.md` | Hand gesture control | 2.0.0 | 2026-10-23 08:00 UTC |
| `avatar-state-transitions.md` | Visual/audio state machine | 2.0.0 | 2026-10-23 08:00 UTC |
| `version-control-and-embedding.md` | This file: how to lock & embed | 2.0.0 | 2026-10-23 08:00 UTC |
| `prompt-test-cases.md` | Automated verification suite | 2.0.0 | 2026-10-23 08:00 UTC |

---

## Versioning Scheme

**Format:** `MAJOR.MINOR.PATCH`

- **MAJOR:** Breaking change to persona behaviour (voice, principles, mandate)
  - Incremented when: WHINK becomes hesitant, MAMBA loses escalation authority, decision framework changes fundamentally
  - Requires: Victor's explicit approval and a dated decision in `docs/decisions.md`
  - Example: MAJOR=2 if MAMBA switches from Obsidian-only to multi-mode

- **MINOR:** Non-breaking change to capabilities or scope
  - Incremented when: A new gesture is added, a new tool registry is integrated, a new permission class is introduced
  - Requires: Lead Architect approval, documented in commit message
  - Example: MINOR=1 if gesture-to-persona mapping adds a new gesture

- **PATCH:** Clarification or wording improvement
  - Incremented when: Typos fixed, examples updated, clarity improved without changing behaviour
  - Requires: Lead Architect review; can be fast-tracked
  - Example: PATCH=1 if a prompt example is made clearer

---

## Locked State

Every prompt file has a header:

```markdown
# [Title]

**Version:** 2.0.0  
**Locked:** 2026-10-23  
**Purpose:** [one line]  
**Access Level:** Open for embedding in OpenClaw gateway; do not edit at runtime
```

**"Locked"** means:
1. The prompt is in git and tagged with the version number
2. No runtime code will edit the prompt text
3. If the prompt needs to change, a new version is created via git
4. Every deployment carries the version number of the prompts it runs

---

## How Prompts Enter the Gateway

### Step 1: Commit to Git

```bash
cd /home/claude/whink-ultimate
git add prompts/WHINK-system-prompt.md
git add prompts/MAMBA-system-prompt.md
git add prompts/decision-framework.md
git add prompts/gesture-to-persona-mapping.md
git add prompts/avatar-state-transitions.md
git add prompts/version-control-and-embedding.md
git add prompts/prompt-test-cases.md

git commit -m "Lock WHINK and MAMBA prompts v2.0.0 for OpenClaw embedding

- WHINK: Chief of Staff voice, EAR protocol, build team dispatch
- MAMBA: Obsidian-only red team, challenge assessment, escalation logic
- Framework: Propose → Challenge → Consensus/Escalate decision flow
- Gestures: Hand control for persona switch, approval ledger, emergency deny
- Avatar states: Idle, Listening, Thinking, Speaking, Awaiting Approval, Escalating, Handoff
- Test cases: Automated verification of both personas

All prompts locked and version controlled. No runtime edits.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

### Step 2: Tag the Release

```bash
git tag -a prompt-v2.0.0 -m "WHINK and MAMBA prompts v2.0.0 locked for OpenClaw"
git push origin main prompt-v2.0.0
```

### Step 3: Build the Gateway Manifest

Create `services/openclaw/config/persona-manifest.yaml`:

```yaml
personas:
  whink:
    name: "WHINK — Chief of Staff"
    prompt_file: "../../prompts/WHINK-system-prompt.md"
    prompt_version: "2.0.0"
    git_commit_hash: "abc123def456..."
    locked_date: "2026-10-23T08:00:00Z"
    model: "claude-opus-4-latest"
    access_level: "open"
    
  mamba:
    name: "MAMBA — Red Team"
    prompt_file: "../../prompts/MAMBA-system-prompt.md"
    prompt_version: "2.0.0"
    git_commit_hash: "abc123def456..."
    locked_date: "2026-10-23T08:00:00Z"
    model: "claude-opus-4-latest"
    access_level: "obsidian_only"

decision_framework:
  file: "../../prompts/decision-framework.md"
  version: "2.0.0"
  git_commit_hash: "abc123def456..."

test_suite:
  file: "../../prompts/prompt-test-cases.md"
  version: "2.0.0"
  automated_tests: true
```

### Step 4: Load Prompts at Gateway Startup

In `services/openclaw/src/gateway.ts` (pseudo-code):

```typescript
async function loadPersonaPrompts() {
  const manifest = await readYAML('config/persona-manifest.yaml');
  
  for (const [personaKey, config] of Object.entries(manifest.personas)) {
    const promptPath = path.join(__dirname, config.prompt_file);
    const promptText = await fs.readFile(promptPath, 'utf-8');
    
    // Verify version matches manifest
    const versionMatch = promptText.match(/\*\*Version:\*\*\s+([\d.]+)/);
    if (versionMatch[1] !== config.prompt_version) {
      throw new Error(
        `Prompt version mismatch: ${personaKey}. ` +
        `File says ${versionMatch[1]}, manifest expects ${config.prompt_version}. ` +
        `Did someone edit the prompt without updating the manifest?`
      );
    }
    
    // Store in memory (never modify)
    personaPrompts.set(personaKey, {
      text: promptText,
      version: config.prompt_version,
      gitCommit: config.git_commit_hash,
      loadedAt: new Date(),
    });
  }
  
  console.log('Persona prompts loaded and verified');
}
```

### Step 5: Use the Prompt at Runtime

When Victor sends a message:

```typescript
async function routeToPersona(message: string, persona: 'WHINK' | 'MAMBA') {
  const promptConfig = personaPrompts.get(persona);
  if (!promptConfig) {
    throw new Error(`Persona ${persona} not loaded`);
  }
  
  const response = await callModel(
    [
      {
        role: 'system',
        content: promptConfig.text, // Read-only, never edited
      },
      {
        role: 'user',
        content: message,
      },
    ],
    {
      model: 'claude-opus-4-latest',
      temperature: 0.7,
    }
  );
  
  // Log which version of the prompt was used
  await logLedgerEntry({
    type: 'persona_response',
    persona,
    promptVersion: promptConfig.version,
    promptGitCommit: promptConfig.gitCommit,
    messageHash: hash(message),
    responseHash: hash(response),
  });
  
  return response;
}
```

---

## No Runtime Edits Policy

**Hard rule:** The gateway code has no `updatePrompt()` or `setPersonaText()` function.

If a prompt needs to change:

1. **Edit the file in git** (one of the 7 markdown files in `/prompts/`)
2. **Increment the version** in the file header
3. **Update the manifest** to reference the new version and commit hash
4. **Commit and tag** in git
5. **Redeploy** the gateway image
6. **The gateway loads the new prompt from git on startup**

This is slow compared to runtime edits. It is supposed to be. The slowness is the safety.

---

## Deployment Checklist

Before deploying a prompt change to production:

- [ ] Prompt file edited in `/prompts/` with clear markdown
- [ ] Version bumped correctly (MAJOR/MINOR/PATCH)
- [ ] Header updated with new date and version
- [ ] `prompts/` files committed to git
- [ ] `prompt-v*.*.* ` tag created and pushed
- [ ] Manifest updated with new commit hash and version
- [ ] `services/openclaw/config/persona-manifest.yaml` committed
- [ ] Test cases run and pass (see `prompt-test-cases.md`)
- [ ] Lead Architect approval (if MAJOR change)
- [ ] Security Reviewer spot-check (injection handling, permissions logic)
- [ ] Gateway Docker image rebuilt and tested locally
- [ ] Change logged in `docs/decisions.md` with date and reason
- [ ] Victor confirms the new behaviour on his Mac

---

## Rollback Procedure

If a deployed prompt causes problems:

1. **Identify the issue:** Review the ledger for the problem persona and version
2. **Revert to prior version:** `git checkout prompt-v1.5.0` (previous working version)
3. **Update manifest** to point to prior git commit hash and version
4. **Rebuild and redeploy** the gateway image
5. **Notify Victor:** Report the issue, the fix, and when the rollback will happen
6. **Post-mortem:** Create an issue in the repo explaining what went wrong and why

---

## Audit Trail

Every persona response logs:

```json
{
  "type": "persona_response",
  "timestamp": "2026-10-23T14:32:05Z",
  "persona": "WHINK",
  "promptVersion": "2.0.0",
  "promptGitCommit": "abc123def456...",
  "promptLockedDate": "2026-10-23T08:00:00Z",
  "userId": "victor",
  "messageHash": "sha256:...",
  "responseHash": "sha256:...",
  "ledgerId": "response-2026-10-23-001"
}
```

This makes it possible to:
- Trace exactly which prompt version was used for each response
- Replay a decision and see which prompt version made it
- Correlate prompt changes with behaviour changes in the ledger

---

## Future Expansion

When OpenClaw is extended to other users:

1. Persona prompts remain locked and versioned
2. The manifest can reference different prompt versions for different tenants (Victor gets v2.0.0, resellers get v1.8.0 until their security review is done)
3. Rollback is per-tenant and does not affect other users

---

## Summary

| Rule | Why |
|---|---|
| Prompts in git, never edited at runtime | Ensures audit trail and accountability |
| Version header in every prompt file | Easy to spot version mismatches |
| Manifest ties git commit to deployed version | Prevents "I don't know which version is running" |
| Startup verification checks file version vs. manifest | Catches accidental edits immediately |
| Test cases run after every deployment | Verifies both personas still work as designed |
| Ledger logs which version was used | Audit trail for behaviour changes |
| Rollback to prior version in git | Fast recovery if a change breaks something |

---

**Commit this strategy to `prompts/version-control-and-embedding.md` in git and do not edit at runtime.**
