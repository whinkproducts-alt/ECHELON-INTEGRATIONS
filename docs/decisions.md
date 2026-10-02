# Decisions log

Newest first. Each entry: date, decision, alternatives, reason.

## 2026-10-02  Phase 4 Voice architecture
Browser Web Speech API as primary STT/TTS in development (zero dependencies).
Server routes /api/voice/stt and /api/voice/tts bridge to Whisper + Kokoro for production/offline.
ADA V2 maps to the TTS_URL/STT_URL env vars — swap the URL to point at ADA when it is running.
Spoken approvals: client-side EAR reading + speech recognition for "approved"/"denied".

## 2026-09-27  No blinking
The avatars do not blink. Animation is limited to audio driven mouth shapes, a subtle breathing motion, and state changes in the interface.
Reason: a convincing blink needs a hand drawn eyes closed frame per character; not worth the cost.

## 2026-09-27  Build team as Claude Code subagents
Twelve project level agents in .claude/agents: five builders, five assurance agents, two guardians. Assurance agents never write the code they check.
Alternatives: installing all 37 contains-studio agents globally.
Reason: that collection targets fast consumer app studios (TikTok, Instagram, whimsy) and has no security reviewer or AI evaluator. It also has no licence file, so it is used as a structural reference only, not copied into this product.

## 2026-09-27  Monorepo layout
apps/web holds the Next.js core. services/ will hold voice, gateway and recall services.
Reason: keeps WHINK's owned code separate from swappable open source services.

## 2026-09-23  Super Jarvis stack
WHINK core plus ADA V2 (voice and vision), OpenClaw (actions), AnythingLLM (documents), model router. LibreChat dropped. Open Voice OS optional.
Reason: all MIT or Apache, so the product can be sold; WHINK already covers LibreChat's role.

## 2026-09-23  MAMBA is Obsidian only
Lawful hardest adversary. White and Grey modes to be removed.

## 2026-09-23  WHINK accent is brand azure #38B6FF
Chosen over emerald to match The WHINK Group. Avatar HUD currently cyan #4FF3EE; decision pending.
