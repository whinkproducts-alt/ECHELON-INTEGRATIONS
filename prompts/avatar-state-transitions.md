# Avatar State Transitions

**Version:** 2.0.0  
**Locked:** 2026-10-23  
**Purpose:** Define avatar visual and audio states during conversation flow  
**Implementation:** Phase 5 Face (avatar renderer + Neural Link)  
**Status:** Framework defined; implementation deferred pending Face phase delivery

---

## Overview

WHINK and MAMBA avatars are always present and reactive. Their state changes reflect what is happening in the conversation: listening, thinking, speaking, approving, escalating. The avatar is not decoration. It is part of the interface.

**Non-negotiables:**
- No blinking (decision made 2026-09-27)
- Mouth shapes driven by audio (viseme-sync lip-sync)
- Subtle breathing motion (not exaggerated)
- State changes in the interface reflect state changes in the avatar

---

## Avatar States

### State: IDLE

**When:**
- App just opened
- Conversation is paused
- Victor is reading an approval card
- No message pending

**Visual:**
- Avatar is centered on screen (or in sidebar, pending Face layout decision)
- Eyes open, gazing straight at Victor (90-degree angle to camera plane)
- Mouth closed, neutral expression
- Subtle breathing motion (3-second cycle, expand/contract chest ~0.5 inch)
- Badge visible (small avatar icon, 32-64 px, showing WHINK or MAMBA)

**Audio:**
- None (silent)

**Neural Link state:**
- Approval card (if pending): visible in amber
- Ledger drawer: closed (unless Victor requested it)
- Input field: ready for text or voice

**Transition:**
- → LISTENING when Victor starts speaking or typing

---

### State: LISTENING

**When:**
- Victor is speaking (STT is active)
- Victor is typing (input field has focus)
- Avatar is acknowledging input

**Visual:**
- Eyes: slight upturn (eyebrows raise ~2mm) and sharpen focus
- Head: very slight tilt toward Victor (nose 3-5° forward)
- Mouth: slightly open, waiting (jaw relaxed, lips parted ~1mm)
- Breathing: pauses briefly (showing attentiveness)
- Subtle indication: rim light around avatar increases by 5% (neural connection signal)

**Audio:**
- Live transcription text appears on Neural Link (if STT)
- Avatar hears but does not speak

**Neural Link state:**
- Transcription visible: "Listening to Victor... 3 words so far..."
- Input field: disabled (avatar has priority)
- Approval card: grayed out (Victor can still see it)

**Transition:**
- → THINKING when Victor finishes speaking or hits send
- → IDLE if Victor cancels input (Escape key)

---

### State: THINKING

**When:**
- Message is being processed
- Model is generating a response
- Tool is being called
- Approval is being evaluated

**Visual:**
- Eyes: close slightly (lids lower ~15%, as if concentrating)
- Head: slight tilt down and to side (thinking pose, 10° down, 5° left/right)
- Mouth: closed, neutral
- Breathing: deepens (longer inhale, 4-second cycle instead of 3)
- Rim light: flickers subtly (processing signal, like neural pathway activation)
- Faint particles or shimmer around eyes (TBD: cost/benefit analysis pending)

**Audio:**
- Silence, or soft ambient tone (optional, Phase 5 design decision)
- No speech from avatar
- STT is off

**Neural Link state:**
- Message: "Thinking..." with rotating indicator
- Action trace (if tools are involved): shows "Tool: calendar_list pending"
- Approval card: hidden until decision is ready

**Tool-specific thinking states (Phase 5 refinement):**

**Tool calling:**
- Tool name appears on Neural Link in gray
- Avatar's thinking state continues until tool result arrives
- Rim light pulses faster (showing active tool loop)

**Permission check:**
- If tool is Class C, neural Link shows "Awaiting approval..."
- Avatar transitions to AWAITING_APPROVAL (see below)

**Injection scan flag:**
- If user input is flagged as suspicious:
  - Avatar's rim light turns red (danger signal)
  - Avatar immediately transitions to ESCALATING (see below)
  - Message is not sent to model
  - Security event appears on Neural Link

**Transition:**
- → SPEAKING when response is ready
- → AWAITING_APPROVAL if Class C action needs approval
- → ESCALATING if injection is flagged or MAMBA blocks proposal

---

### State: AWAITING_APPROVAL

**When:**
- Class C action is pending approval
- EAR is issued and waiting for Victor's decision
- 30-second countdown is active

**Visual:**
- Avatar: transitions to a "waiting" pose
  - Head turns slightly away (looking to the side, not at Victor)
  - Eyes: wider, more alert (eyebrows raised further)
  - Breathing: faster, shallower (anxiety signal, 2.5-second cycle)
  - Rim light: amber pulse (matching the approval card's amber background)
  - Mouth: slightly open, as if about to speak but holding back

**Audio:**
- TTS plays the approval request (one time only, non-interruptible)
- Soft alert tone (optional)
- If Victor says "approved [id]", TTS confirms: "Approved. Running [action]."
- If Victor says "deny [id]", TTS confirms: "Denied. Request cancelled."
- If 30 seconds pass, TTS: "Approval expired. Request cancelled."

**Neural Link state:**
- Approval card: front and center, amber background, 30-second countdown visible
- Card shows: action, exact parameters, request id
- Buttons: "APPROVE" + id / "DENY" + id / "MORE INFO"
- Action trace: tool pending, waiting for approval decision

**Gesture handling:**
- Voice: Victor can say "approved [id]" or "deny [id]"
- Gesture: right hand thumbs-up = approve current request
- Gesture: both hands X-cross = deny all pending
- Gesture: left hand pause = hold for later (Victor will re-approve)

**Transition:**
- → SPEAKING when approved (avatar speaks confirmation and runs action)
- → IDLE when denied (avatar releases the request, goes silent)
- → IDLE when expired (30 seconds passed, approval cancelled)
- → ESCALATING if Victor requests more info or if MAMBA raises objection

---

### State: SPEAKING

**When:**
- Avatar is delivering a message
- Avatar is reading an approval request
- Avatar is delivering a tool result
- Avatar is escalating a decision to Victor

**Visual:**
- Head: level, looking straight at Victor (90° to camera plane)
- Eyes: open, engaged, blinking OFF (by design decision 2026-09-27)
- Mouth: moving, driven by viseme sync (audio-driven lip-sync)
  - Phoneme stream maps to mouth shapes (6 mouth shapes per avatar)
  - Timing: aligned with audio stream in real-time
- Breathing: normal (3-second cycle), does not interrupt mouth movement
- Rim light: steady (not pulsing)
- Head: subtle micro-movements (nods, tilts) to match message tone
  - "Yes" questions → small forward nod at key points
  - "No" statements → small tilt away at key points
  - Lists → alternating tilts left/right with each item

**Audio:**
- TTS plays message in persona voice
  - WHINK: direct, crisp delivery, no filler words, higher pitch (TBD)
  - MAMBA: measured, deliberate, lower pitch, pauses for emphasis (TBD)
- Message appears on Neural Link text-by-text as it is spoken
- If Victor interrupts, TTS stops and avatar transitions to LISTENING

**Neural Link state:**
- Message text: visible in real-time as avatar speaks
- Ledger entry: created with `persona: WHINK` or `persona: MAMBA` and message content
- Approval card: hidden (unless multiple decisions pending, then queued)
- Input field: disabled until avatar finishes

**Tone-specific mouth states (Phase 5 detail):**

**Urgent/escalation:**
- Mouth movement is more pronounced
- Eyebrows raise further (concern signal)
- Pauses are longer (giving words weight)

**Question:**
- End of message: slight upturn of mouth (question mark equivalent)
- Eyebrows raise on final syllable
- Rim light pulses once

**Confirmation:**
- Small nod at end of message
- Mouth closes with a tiny smile (slight upturn at corners)

**Transition:**
- → IDLE when message is complete
- → LISTENING if Victor interrupts during speech
- → ESCALATING if MAMBA has an objection to raise
- → AWAITING_APPROVAL if a Class C decision is embedded in the message

---

### State: ESCALATING

**When:**
- MAMBA challenges a WHINK proposal
- Injection scan flags user input as suspicious
- A decision exceeds Victor's delegation level
- A tool call is denied by the permission engine
- A risk is flagged as CRITICAL

**Visual:**
- Avatar: switches to MAMBA (if currently WHINK) or emphasizes severity
- Eyes: sharper, more intense (sclera visible, pupils narrowed)
- Head: tilted away (skeptical pose, 5-10° back and left/right)
- Mouth: thin line (closed, serious expression)
- Breathing: deliberate, slower (showing focus)
- Rim light: red or deep crimson (danger signal)
- Shoulders: slight back (if visible in avatar frame)

**Audio:**
- If injection flagged: avatar says "I flagged this as suspicious. Show me the ledger entry?" (WHINK voice, calm but firm)
- If MAMBA escalates: "Stop. I need to tell you why this breaks things." (MAMBA voice, urgent but controlled)
- If permission denied: "This requires a decision I can't make. You decide." (WHINK voice, direct)
- TTS: non-interruptible until the escalation is stated

**Neural Link state:**
- Escalation card: replaces approval card, larger, shows risk/reason
- Ledger entry: created immediately with `event: escalation` and details
- Color: red or deep orange (matching rim light)
- Shows: what was escalated, why, and Victor's three options (APPROVE / REVISE / DENY)

**Tool denial example:**
```
Neural Link escalation card:

TOOL EXECUTION DENIED

Tool: instagram__post_create
Reason: Class C action, no approval pending, autonomy level 1

Options:
  [ APPROVE NOW (id: xyz) ]
  [ REVISE REQUEST ]
  [ CANCEL ]

Ledger: tool_denied_permission_class_C
```

**Injection flag example:**
```
Neural Link escalation card:

INPUT BLOCKED — SECURITY EVENT

Pattern: injected instruction detected
Content: [redacted]

Action: User message was not sent to model. Security event logged.

Options:
  [ VIEW LEDGER ]
  [ CONTINUE ]

Ledger: injection_scan_block, pattern_type: direct_instruction
```

**MAMBA challenge example:**
```
Neural Link escalation card:

MAMBA ASSESSMENT: RISK FLAGGED

Proposal: Launch WHINK CSA to SMBs in Q1
Risk: Vendor lock. Stripe payment processing blocks SaaS-as-a-service.

Your options:
  [ APPROVE AND PROCEED ]
  [ REVISE WITH MITIGATIONS ]
  [ DENY AND PLAN DIFFERENTLY ]

Ledger: challenge_assessment, recommendation: escalate
```

**Transition:**
- → SPEAKING when Victor makes a decision (approve/revise/deny)
- → AWAITING_APPROVAL if MAMBA escalation is conditional on a new approval
- → IDLE if Victor denies the escalated action

---

### State: HANDOFF

**When:**
- Phase complete and results are being handed off
- Victor is switching to a different application
- Control is being passed to another user or agent
- Context is being saved for later resumption

**Visual:**
- Avatar slowly moves off-screen (slide left/right, 2-second animation)
- Eyes: look toward exit point (where avatar is sliding)
- Mouth: subtle smile (closure signal, not goodbye)
- Breathing: slows and deepens (winding down)
- Rim light: dims to 50% (still present but less active)

**Audio:**
- Optional: soft confirmation tone
- No speech (avatar is handing off, not signing off)
- TTS off

**Neural Link state:**
- Phase summary: shows what was accomplished
- Ledger: Phase complete entry with handoff notes
- Input field: disabled
- Approval card: any pending requests moved to "Awaiting when you return"

**Transition:**
- → IDLE when Victor returns
- → Task complete if phase is finished

---

## State Machine Diagram

```
IDLE ←→ LISTENING → THINKING → SPEAKING → IDLE
                       ↓           ↓
                   AWAITING_   ESCALATING
                   APPROVAL        ↓
                       ↓      (REVISE/APPROVE/DENY)
                    SPEAKING      ↓
                       ↓      SPEAKING → IDLE
                      IDLE

Emergency paths:
LISTENING → IDLE (Escape)
SPEAKING → LISTENING (interrupt)
Any state → ESCALATING (injection, critical risk)
```

---

## Animation Budgets

To keep avatar rendering performant (especially with hand tracking in Phase 5):

- Mouth sync: <40ms latency (audible lip-sync window)
- Breathing cycle: 3 seconds (smooth, not frame-rate dependent)
- Rim light: 60 FPS (GPU-accelerated, not CPU-bound)
- Head micro-movements: 24 FPS (perceptually smooth, lower than full frame rate)
- State transitions: 200-500ms (not snappy, not sluggish)

---

## Accessibility

- **Animation can be reduced:** Respect `prefers-reduced-motion` media query
  - Breathing motion disabled
  - State transitions become instant (no sliding, no fading)
  - Micro-movements (nods, tilts) disabled
  - Mouth sync still active (required for speech intelligibility)

- **Rim light color:** For colorblind users, rim light states also use symbols
  - Thinking: small spinner icon
  - Awaiting approval: amber background + countdown numbers
  - Escalating: red background + warning icon
  - Active tool loop: small gear icon

---

## Testing

Victor will validate avatar state transitions in Phase 5:

1. Avatar is present in all states (no disappearing, no popping)
2. Mouth sync is clean and does not lag >40ms behind audio
3. Rim light color is visible in low-light conditions (important for evening/night use)
4. Head micro-movements feel natural (not robotic, not distracting)
5. Escalation states are visually distinct and immediately clear
6. Breathing motion does not break when transitions happen quickly
7. Performance does not degrade with hand tracking active

---

**Commit this specification to `prompts/avatar-state-transitions.md` in git and do not edit at runtime.**
