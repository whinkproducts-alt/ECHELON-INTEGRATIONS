# ECHELON-INTEGRATIONS

Private test sandbox for ECHELON. This repository contains the WHINK application, its integration services, and the isolated Mac sandbox launcher. Changes are tested here before a separate review and promotion to [ECHELON-CORP](https://github.com/whinkproducts-alt/ECHELON-CORP).

## Available for testing

- Faster navigation with immediate loading feedback.
- Selectable Whisper + Kokoro and VoiceStudio speech paths, daily health checks, and saved per-agent voice IDs. Models and VoiceStudio are installed separately; opening the interface alone does not prove microphone or speech output works.
- Audio-reactive Board and Holo avatar lips. Visual timing still needs Mac acceptance.
- Higgsfield media integration behind account permissions, exact approvals and spending controls. It calls a hosted provider and is disabled until configured; no free local video engine is bundled.
- An isolated Mac sandbox with its own database, configuration, port, Docker project, cookies and optional local recovery. It does not point at ECHELON-CORP data.

See the [Mac sandbox installation and test guide](docs/product/ECHELON-INTEGRATIONS-SANDBOX.md). The [upgrade consolidation record](docs/UPGRADE-CONSOLIDATION-2026-11-12.md) names held major-version upgrades and verification limits. Current work and handoff state are in [pending tasks](docs/pending-tasks.md).

## Development

From the repository root, install with `pnpm install --frozen-lockfile`, then configure a private `.env` from the examples. Never commit credentials. Run the web app with `pnpm dev`. CI checks TypeScript, lint, tests, database migrations, production build and browser flows. A green CI run does not replace real Mac microphone, speech, avatar or provider acceptance.

The standalone browser integration modules under `src/browser/` are retained in this repository but are not automatically activated by the Mac app bundle.

## Next priority

The [voice-to-initiative execution brief](docs/product/VOICE-INITIATIVE-EXECUTION-PRIORITY.md) defines the requested flow: speak to WHINK, MAMBA or Marcus Vale, give an initiative, receive an execution receipt and follow progress. Existing permission, owner-private and approval rules still apply. This end-to-end flow is a priority to build and test; it is not claimed complete by the current sandbox.

## License

Proprietary — WHINK Apps. The optional private speech runtime has its own [dependency and model license notices](services/local-speech/LICENSES.md).
