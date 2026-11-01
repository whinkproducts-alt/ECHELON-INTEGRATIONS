# KAMSI Architecture

## Layers

**Layer 1: WHINK Org-Kit** — 326 agents, 16 directorates, 570 skills. All dormant by default.

**Layer 2: Approval Gates** — Every task creates EAR. Victor approves (Tier 1), directorate lead (Tier 2), or auto-approve (Tier 3). Hash-locked after approval.

**Layer 3: Tool Gateway (OpenClaw)** — Multi-channel: email, Slack, Discord, iMessage, Telegram, WhatsApp. MCP-based tool routing.

**Layer 4: HOLO Gestures** — Hand-tracking (MediaPipe). 10 gestures (pinch, crush, flick, thumbs up/down, point, open hand, peace, ok, fist, palm). Real-time 3D agent orb visualization.

**Layer 5: Persistence** — Postgres + pgvector (memory), SQLite audit trail, org-kit state JSON.

## Data Flow

User gesture or request → HOLO/channel input → Approval framework (EAR) → Agent dispatch (org-kit) → Skill execution → Tool calls → Response → Channel output.

## Key Tech Stack

- Frontend: React 18 + Tauri 2 + HOLO (Python MediaPipe server)
- Backend: Node.js + TypeScript (OpenClaw gateway)
- Database: Postgres + pgvector (memory), SQLite (audit)
- AI: Claude (primary) + Gemini + Ollama (local fallback)
- Voice: Deepgram (STT) + ElevenLabs (TTS)
- Hand Tracking: MediaPipe (Python, local-only)

## Approval Flow

Gesture/request → Validation (RBAC, time-of-check) → EAR created → Victor notified → Victor approves (voice/gesture) → Hash-lock params → Agent executes → Ledger logs → Response → Update HANDOFF.md.

## Why This Architecture

- **Decentralized execution:** 326 agents can work in parallel without bottlenecking on Victor
- **Audit trail:** Every decision logged and reversible
- **Multi-channel:** Same agents accessible via any interface (desktop, voice, gesture, chat)
- **Human control:** Approval gates prevent rogue agent behavior
- **Self-improving:** Real-world logs from 6-month UAT feed into Phase 7 refinement
