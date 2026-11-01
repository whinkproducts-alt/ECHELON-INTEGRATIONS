# Gesture-to-Persona Mapping

**Version:** 2.0.0  
**Locked:** 2026-10-23  
**Purpose:** Gesture control for WHINK and MAMBA persona switching  
**Implementation:** Phase 5 Face (Neural Link + hand tracking via ADA V2)  
**Status:** Framework defined; implementation deferred pending Face phase delivery

---

## Overview

Hand gestures allow Victor to switch between WHINK and MAMBA, request an approval ledger, and control the interface without breaking the flow of work. Gestures are recognized via ADA V2 hand tracking and decoded by Neural Link.

All gestures:
- Are voluntary. Victor initiates them; they never auto-trigger.
- Respect quiet hours. If Victor has marked quiet hours, gesture requests are queued until normal hours.
- Are logged to the ledger with timestamp and context
- Do not elevate permissions. A gesture to switch to MAMBA does not bypass the permission engine.

---

## Primary Personas

### WHINK Activation Gesture

**Trigger:** Right hand raised, fingers spread, palm forward, held 1 second  
**Alternative:** Voice: "WHINK" + confirmation tone  
**Effect:**
- Neural Link avatar transitions to WHINK (cyan suit, round glasses)
- Ledger logs `persona_switch: WHINK_REQUESTED`
- Pending MAMBA advice is filed and out of active view
- Next message will be from WHINK

**When you use this:**
- You want direct execution focus
- You need WHINK to finish a thought without interruption
- You have already heard MAMBA's challenge and want to move forward

---

### MAMBA Activation Gesture

**Trigger:** Left hand raised, fingers curled (fist with thumb extended), twist wrist 90°, hold 1 second  
**Alternative:** Voice: "MAMBA" + confirmation tone  
**Effect:**
- Neural Link avatar transitions to MAMBA (charcoal suit, scar, red lining)
- Ledger logs `persona_switch: MAMBA_REQUESTED`
- Current WHINK proposal is visible for MAMBA to challenge
- Next message will be from MAMBA's red-team assessment

**When you use this:**
- You are about to propose something high-stakes
- You want MAMBA to stress-test your assumption before you commit
- You need to hear the hard truth about competitive exposure

**Example use:**
```
1. You: "I'm thinking of selling WHINK CSA to a consulting agency as white label. What do you think?"
   WHINK: [Issue EAR for partnership]
2. You: [Make MAMBA gesture]
3. MAMBA: [Challenge assessment with vendor lock risks, payment processing constraints, IP exposure]
4. You: "Okay, go back to WHINK. How do we mitigate that?"
   WHINK: [Revised EAR with conditions]
```

---

## Control Gestures

### Request Approval Ledger

**Trigger:** Both hands raised, palms facing each other, fingers pointing up, tap hands together 2× rapidly  
**Alternative:** Voice: "Show approvals" or "Ledger"  
**Effect:**
- Neural Link opens the approval ledger drawer (right side)
- Shows recent decisions with both WHINK and MAMBA perspectives
- Pending Class C actions highlight in amber (30-second expiry shown as countdown)
- Approved actions show with decision and who approved

**When you use this:**
- You need to review what was decided while you were focused on something else
- An approval is expiring and you need to see it again
- You want to audit WHINK's or MAMBA's reasoning on a recent call

---

### Pause Persona

**Trigger:** Right hand, palm flat, fingers spread, wave down 1×  
**Alternative:** Voice: "Pause" or "Hold on"  
**Effect:**
- Current persona message stops mid-sentence
- Neural Link avatar freezes (no mouth movement, no breathing)
- Ledger logs `persona_pause: [persona]`
- When you resume, the avatar picks up where it left off

**When you use this:**
- You got an incoming call or alert and need WHINK to wait
- You want to let MAMBA's words sit for a moment before responding
- You need to re-read something without new messages stacking up

---

### Resume Persona

**Trigger:** Left hand, palm flat, fingers spread, wave up 1×  
**Alternative:** Voice: "Go" or "Continue"  
**Effect:**
- Avatar resumes mouth movement and message delivery
- Ledger logs `persona_resume: [persona]`

---

### Clear Context

**Trigger:** Both hands, palms facing inward, cross arms in X shape, hold 1 second  
**Alternative:** Voice: "Reset" or "Clear context"  
**Effect:**
- Closes all pending class C requests (not approved/denied, just closed)
- Neural Link clears the approval card
- Ledger logs `context_clear` with timestamp
- Victor can start fresh without stale requests cluttering the interface

**When you use this:**
- You are interrupted mid-approval and want a clean slate
- You decide not to approve something and want it off the screen
- You are switching to a completely different task and want to close the book on the last one

---

## Emergency Gestures

### Deny All Pending

**Trigger:** Both hands, fists, rapid double-tap on thighs  
**Alternative:** Voice: "Deny all" or "No to everything"  
**Effect:**
- Every pending Class C request is marked DENIED
- Every EAR is marked CANCELLED
- Neural Link clears all approval cards
- Ledger logs `emergency_deny_all` with list of cancelled requests

**Confirmation:** Neural Link plays a 2-second audio confirmation ("All requests denied") to prevent accidental triggers

**When you use this:**
- You see an injected instruction trying to make you approve something you did not ask for
- You want a hard stop on all pending decisions
- You are handing control to someone else and want all your approvals off the board

---

### Raise Avatar Volume

**Trigger:** Right hand, thumbs up, move hand up 6 inches, hold  
**Effect:**
- Avatar's TTS volume increases in 20% increments per second of hold
- Neural Link shows a volume bar growing in amber
- Ledger does not log (cosmetic only)

---

### Lower Avatar Volume

**Trigger:** Right hand, thumbs down, move hand down 6 inches, hold  
**Effect:**
- Avatar's TTS volume decreases in 20% increments per second of hold
- Neural Link shows the volume bar shrinking
- Ledger does not log (cosmetic only)

---

## Gesture Error Handling

### Ambiguous Gesture

If ADA V2 confidence is below 75%:
- Neural Link shows a ghost avatar outline performing the gesture
- Avatar says: "I did not quite catch that. Try again or tell me what you need."
- Ledger logs `gesture_unrecognized: confidence_X.XX`
- No action taken

### Conflicting Gestures

If both WHINK and MAMBA activation are triggered in quick succession:
- Neural Link asks for clarification: "WHINK or MAMBA?"
- Avatar waits for verbal confirmation
- Ledger logs `gesture_conflict`

### Gesture During Execution

If you trigger a gesture while a tool is executing:
- The gesture is queued
- Avatar finishes the tool result
- Your gesture is processed immediately after
- Ledger logs both the tool result and the gesture, in order

---

## Accessibility Notes

For users who cannot use hand gestures:

1. **Voice alternative:** Every gesture has a voice command equivalent (listed above as "Alternative")
2. **Text alternative:** Via the approval card buttons and Neural Link menu
3. **Keyboard alternative:** Hotkeys (defined in Phase 5 Face spec)
4. **Eye tracking alternative:** Gaze + dwell time (future expansion)

---

## Logging Gestures

Every gesture is logged to the ledger with:

```json
{
  "type": "gesture_recognized",
  "gesture": "MAMBA_ACTIVATION",
  "timestamp": "2026-10-23T14:32:05Z",
  "confidence": 0.92,
  "userId": "victor",
  "context": {
    "prior_state": "WHINK_SPEAKING",
    "message_position": 157,
    "pending_requests": 1
  },
  "action_taken": "PERSONA_SWITCH_MAMBA",
  "ledger_entry_id": "gesture-2026-10-23-042"
}
```

---

## Implementation Roadmap

| Phase | Task | Status |
|---|---|---|
| Phase 5 Face (Q4 2026) | ADA V2 hand tracking integration | Planned |
| Phase 5 Face | Neural Link gesture decoder | Planned |
| Phase 5 Face | Avatar state transitions (idle → listening → thinking → speaking) | Planned |
| Phase 5 Face | Gesture test cases (Victor's manual validation) | Planned |
| Phase 6 Product | Gesture customization (rebind gestures to Victor's comfort) | Future |
| Phase 6 Product | Gesture profiles (different gestures for different contexts) | Future |

---

**Commit this mapping to `prompts/gesture-to-persona-mapping.md` in git and do not edit at runtime.**
