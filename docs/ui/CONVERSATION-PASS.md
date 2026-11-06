# Conversation and left-navigation pass

Base: local ui/dashboard-polish at 7ed73d5, retaining prior uncommitted UI work.

Acceptance before implementation:
- Canonical Conversation, WHINK Presence and MAMBA Obsidian share real conversation/history/approval contracts, while retaining separate route guards.
- Persona choices remain backend-confirmed and synchronized with the shell. Founder-only identity remains server protected; no new permission or spend authority.
- Static demo risks, approvals, messages and hardware states must not appear as live account data.
- Keep drafts and partial replies after failures; prevent duplicate sends during conversation creation; prevent stale history from overwriting another conversation.
- Inspect actual browser captures at 390, 768 and 1440px. Exercise history, persona selection, commands, input, failures and keyboard controls in isolated fixtures without real model calls.
- Run current package checks and independent assurance. Live auth/model/voice verification remains separate.

## Implemented and observed

- All 34 left-navigation URLs have matching repository page files. This is source inventory, not live workflow verification of all 34 tabs.
- Canonical Conversation, WHINK Presence and MAMBA Obsidian now use one governed conversation component. Existing authentication, Obsidian display guard, API authorization, model routing, approval decisions and spend controls remain authoritative.
- Removed hardcoded demo conversations, fictitious threats/accounts, sample swarm activity and simulated hardware toggles from the authenticated presence views. Official supplied portraits and restrained blue/red framing remain; no new artwork or altered faces.
- Shared backend-confirmed persona context accepts the existing eight API identities; founder-only registration remains server-gated and is hidden from non-founder selectors/command menus. Premium directory support remains limited to its two actual executives.
- In-memory, user-keyed conversation workspace retains draft/conversation/project across presentation routes. No sensitive draft or message content is written to browser storage. Route-crossing persistence was source-reviewed; real authenticated navigation remains pending.
- HTTP failures, history failures and interrupted SSE no longer become empty success. Definite rejects restore the draft; uncertain delivery asks the user to check history. Partial replies retain their citations. Conversation creation is locked against duplicate sends and no longer races with the initial history fetch.
- Saved replies no longer show a false Speaking state or large animated speaking portrait. Actual microphone/audio state comes from the voice hook. Starter cards fill a draft rather than immediately submitting it.
- Native project/model selectors, keyboard command menu, IME handling, reduced-motion scrolling, stable hydration preferences and explicit focus return for conversation-history and shell-navigation drawers.
- Microphone capture now cancels late permission grants after release/navigation/lockdown, closes tracks if recorder construction fails, avoids STT upload on unmount/lockdown and retains Local-Only restrictions. Real microphone permissions and providers were not invoked during UI testing.

## Verification

- Actual fixture captures: three views × 390/768/1440px, no document horizontal overflow or controls extending beyond the right viewport edge in the inspected layouts. Mobile empty state was corrected to begin at its heading rather than auto-scroll to the bottom.
- Fixture history selection and MAMBA send: user message and reply retained with the correct identity; shell selection synchronized. No paid model call occurred.
- Creation failure and access-denied send: draft retained with explicit error. Interrupted stream: one partial reply and Fixture-reference.pdf p.2 citation retained with an unconfirmed-delivery warning. History failure: explicit retry and sending disabled until history loads.
- Keyboard Commands → ArrowDown → Enter inserted /mamba into the draft without sending. Native model selector and options were inspected.
- Mobile history drawer and shell nav drawer: focus entered the dialog, Escape closed it, focus returned to Conversations and Open navigation respectively.
- Independent assurance found a microphone startup race and partial citation loss; both were fixed and re-reviewed. Browser verification subsequently found deferred React ref reads dropping citations; arrays are now captured before queued state updates, with the retained citation verified in a screenshot.
- Fresh final preview reload recorded no Runtime.exceptionThrown events. Earlier captured promise errors were traced to the Next development CSS loader link.onerror rejection during hot reload. One preview tab stalled during a later navigation; a fresh tab recovered and the final captures were saved. This is not production runtime proof.
- Focused current test script: 38 tests passed in six files. Typecheck passed. Lint: zero errors, five existing warnings. Production webpack build result is recorded in the companion review report after its completion.

## Remaining gates

Live authenticated history/persona persistence, model streaming, voice/STT/TTS services, real approval outcomes, full offline recovery, physical browser zoom and a complete accessibility audit remain unverified. The other left-navigation screens have not all received an individual visual redesign in this slice. No new asset request is needed for these conversation views; cinematic arrival footage remains a separate earlier pending item. No deployment, merge, push, paid demonstration or external message was performed.

Final verification limitation: later standard/bounded-heap production builds compiled but stalled in Next TypeScript stage and were stopped (130); later standalone typecheck repeats also stalled. Earlier typechecks/builds completed, but no completed final-tree typecheck/build is claimed. Full details in ECHELON_Conversation_Review.md.

Last focused-suite repeat: 37 passed plus one unchanged ledger filesystem scan timeout; targeted ledger rerun passed all 9 with no test changes. Final lint: zero errors, five existing warnings.
