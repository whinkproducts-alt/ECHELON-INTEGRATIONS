# Key Decisions & Rationale

## Why Next.js + Tauri 2 (not Electron)?
Tauri 2 is lighter, faster, uses native webview. Electron is bloat.

## Why Postgres + pgvector (not MongoDB)?
Structured data, vector search for semantic memory. SQL predictability.

## Why Claude Primary (not GPT-4)?
Cost, speed, API reliability. GPT-4 is backup for extended reasoning.

## Why org-kit agents dormant by default?
Prevents accidental execution. Victor approves what runs, when.

## Why HOLO gestures?
Hands-free control matches "proactive CEO" vision. Voice alone isn't enough for complex org navigation.

## Why 6-month UAT before shipping?
Self-learning loops need real usage patterns. Synthetic test data is useless.

## Why hash-locked approvals?
Prevents bait-and-switch: Victor approves task X, agent tries to execute task X' (modified). Lock stops that cold.

## Why Deepgram + ElevenLabs with fallback each way?
Either could go down. Fallback keeps system running. Both are cheap ($0.004/min voice).

## Why multi-tenant from day one?
KAMSI is for Victor first, but product vision is SaaS. Architecture reflects that.

## Why Obsidian-only MAMBA?
Lawful red-teaming only. No illegal-help mode. Obsidian mode isolates her from normal voice/chat channels.
