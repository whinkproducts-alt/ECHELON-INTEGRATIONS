# Media, selectable speech and navigation delivery candidate

Owner authorized the final architecture and implementation on 8 November 2026. Source is on `delivery/media-voice-performance`, based on main `bcdd0caa18201cf1c0e09adc71aef7855365f495`. This is an unsigned local installation candidate; no merge/deployment or Mac acceptance is claimed.

## Delivered behavior

- Navigation acknowledges clicks, uses a minimal fresh onboarding read, and provides loading/error boundaries. Display data shares an account-owned disposable cache with mutation invalidation; private data clears on account changes. Hidden panels stop polling and reads time out. The reported minute-long Mac stall was not measured.
- Speech Settings offers Auto, Whisper+Kokoro, VoiceStudio and previous provider. Daily 5 a.m. timezone/DST checks use an owned known-speech fixture and actual bounded STT/TTS samples, durable leases, missed-run catch-up, manual overrides and signed account-bound per-turn selection. Agent voice assignments persist and are roster-validated, transactionally merged and validated per service. Missing saved voices produce a notice.
- VoiceStudio is an external application with account-bound local credentials. A four-endpoint authenticated loopback bridge permits a deliberate Docker-to-Mac topology without weakening the global Local-Only URL guard. The default speech API image has no inference engines; missing runtimes/models return503. No AGPL VoiceStudio source is copied.
- Animated Board/Holo portraits deform original lip pixels instead of drawing mouth/teeth stamps; they follow audio, silence/pause/cancel and reduced-motion controls. Canonical presence portraits remain static. This is not phoneme alignment.
- Media Studio and team-discoverable tools use existing governance. Owner approves exact prompt egress for a provider estimate, then exact quoted generation. A higher refreshed estimate needs new approval. Reservation/replay protection and account-scoped status preserve uncertain spending; completed billing stays held pending reconciliation. Estimates are not a guaranteed final invoice. No paid HTTP calls occurred.

## Verification

- Full JavaScript suite: 2409 passed, 112 skipped; no unhandled errors. The existing oversized multipart test fixture was materialized before cancellation to avoid a reproduced Node24 Undici test-producer enqueue-after-cancel error, without changing production upload limits.
- TypeScript passes with Prisma6.7 engine-less generated types. Engine downloads from binaries.prisma.sh are policy-blocked; real PostgreSQL application/lease/concurrency and migration execution are not verified.
- Python API contract tests: 8; bridge tests: 7. Both Docker service images built and started under non-root users with read-only filesystem/no capabilities; unauthorized calls401, missing host service/model503. They are API/transport checks, not inference. Default API: 15 pins show zero listed PyPI metadata advisories; that is not a complete vulnerability certification.
- Independent actual-component Chromium fixtures:12 speech-hook lifecycle scenarios, saved voices/manual/Auto settings/error/contrast checks, full mocked protected media workflow, repeat-status retries and avatar/briefing interruption checks pass without browser exceptions. Controlled network/audio fixtures are not a real microphone or provider test.
- Independent assurance found and builders corrected account/profile isolation, capture cancellation, late audio, concurrent voice-save loss, stale selector, same-ID status retry, bridge resource bounds and accounting-lock issues. No unresolved concrete blocker remains in the reviewed snapshots; live acceptance gaps remain.
- Production webpack build passes; TypeScript passes; full ESLint has zero errors and four existing warnings. Shell syntax, Compose profiles and staged secret scan pass (101 changed files at the scan). ZIP content/mode verification is recorded in release.json and the final handoff after artifact inspection.

## Owner/runtime gates

1. Explicit dependency-policy exception for proposed GPL/LGPL speech runtime components; PSF interpreter/typing platform terms documented separately. Default image does not install these engines or NumPy/FFmpeg bundles. Model and individual voice licenses must also be accepted before installing assets.
2. Allow Prisma's official engine-download domain to complete genuine database/migration verification. No TLS/checksum/proxy bypass was used; engine-less type generation is not a substitute.
3. On the actual M3/16GB Mac, complete VoiceStudio runtime/models or approved Whisper/Kokoro setup, configure private account-bound tokens, and test microphone/codecs/audible output, saved agent IDs, scheduler catch-up, memory pressure and lip appearance. This cloud session cannot execute on the Mac.
4. Hosted Higgsfield configuration, funding and exact protected approvals before a live generation. Installing open-source studio software does not include free hosted generation.

## Installation and rollback

ZIP includes an unsigned app, top-level Start/Configure Speech commands, architecture and setup notes; `.pkg` creation/signing requires a Mac. Private state remains in the existing Application Support directory, with the existing encryption/auth keys and separate persistent database volume. New installs choose an alternative port if needed; upgrades preserve origins/passkeys. No runtime/model download on health checks, no reset/dbpush/seed or automatic paid action.

Disable selectable speech by setting SPEECH_SELECTION_ENABLED=false; use previous provider, and disable new media via HIGGSFIELD_ENABLED=false. Existing database and additive speech tables remain intact. Stop optional services without deleting volumes. A source rollback must preserve migration history and require a backup review; do not drop the new preference/history tables merely to undo UI changes.
