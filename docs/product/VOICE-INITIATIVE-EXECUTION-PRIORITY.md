# Next priority: spoken initiative to execution

Owner request, 2026-11-12: speak naturally to WHINK, MAMBA or Marcus Vale about an initiative, and have the selected agent begin authorized work and report progress. The intended user flow is: **give an instruction → see it accepted → work begins → receive results**. This is the next build priority after the Integrations sandbox is usable for speech testing. It is an acceptance contract, not a claim that the flow already works.

Founder decision, 2026-11-12 (America/Edmonton): the first end-to-end slice targets **WHINK**, creates a durable project and begins one safe internal task automatically. The owner may later select MAMBA or Marcus Vale; their special privacy and authority rules still apply. See [Founder decisions](FOUNDER-DECISIONS-2026-11-12.md).

## User experience

1. From any relevant screen, select or say the recipient, then speak the initiative. Show live capture and transcription, and let the owner correct the text before submission when recognition is uncertain. Typed input remains available.
2. Confirm the chosen recipient and the accepted objective in one short response. Immediately create an account-scoped initiative ID and show status: queued, working, awaiting approval, completed, or failed. Do not make the user repeat the instruction after a screen change or speech service switch.
3. Dispatch authorized tasks to the existing durable worker/tool path. Stream concise spoken and visible progress. The owner can interrupt or stop; cancellation fences new work and reports what already happened.
4. Return a result with actions taken, evidence and unresolved steps. Recover the same initiative after a page reload, speech interruption or service restart.

## Identity and permission boundaries

- WHINK and MAMBA are personas, never a source of extra permission. MAMBA's strategy role must not bypass policy or turn a speculative plan into an action.
- Marcus Vale is Founder-private. His initiative, transcript, memory, tasks and results must be sealed to the owner and his authorized private channel. Selecting his name does not grant another account access.
- Route each tool action through the existing permission engine, account-scoped admission, exact protected-action approval, budget checks and ledger. Money movement and proprietary export always pause for the owner's exact in-app approval. A spoken “yes” or an uncertain transcript is not approval.
- Do not auto-start paid inference or Higgsfield generation because the user spoke an initiative. Show the cost and request the required approval.

## Build slices

1. **Capture and target:** reliable microphone permission, turn detection, correction and target selection using the existing selectable speech services. A service failure leaves the transcript and typed fallback intact.
2. **Durable initiative:** persist objective, recipient, owner/account, idempotency key, status, step receipts and cancellation state. Repeated submission or reconnect must not duplicate work.
3. **Execution bridge:** submit through the existing worker/gateway path with deadlines and permission checks. Return the initiative ID before long work starts.
4. **Progress and reply:** visible timeline plus brief speech, with reconnect/resume and clear awaiting-approval status.
5. **Founder-private Marcus Vale path:** explicit owner-only authorization and negative cross-account/persona access tests.

## Acceptance on the M3 Mac sandbox

- Say a simple safe initiative to each recipient. The app captures the intended words, confirms the recipient, creates one initiative, starts one authorized task, and returns an observable result without a second manual entry.
- Interrupt speech and reload the page while an initiative runs. The same initiative and receipts return; work is not duplicated.
- Make both speech options fail. The typed path remains usable and no action is silently accepted from an uncertain transcript.
- Ask for a protected action. The app pauses with an exact approval card, performs nothing before approval, and records denial or expiry accurately.
- Verify a second account and ordinary WHINK/MAMBA context cannot read Marcus Vale's sealed objective or results.
- Measure time from end of speech to accepted initiative and first visible progress on this Mac; agree a budget from the measured baseline before calling it seamless.
