# Governed media production connector

Higgsfield is a media-production asset for media, branding and other authorized teams. It does not supply speech recognition, speech output or spoken approval. VoiceStudio remains separate; Whisper and Kokoro are retained.

## Workflow

The authenticated Media studio (`/dashboard/media`, `/api/media`) and standard tools use the same existing permission engine, tenant ledger and 30-second, hash-locked, once-only approvals. `userId` is the account scope throughout; team tools operate within that account. Credentials never cross that boundary. There is no parallel approval authority or direct route-to-provider dispatch.

1. Draft an image or video prompt. Exact documented model/options are visible locally; no prompt leaves the account yet.
2. Request `media_quote`. **Class C proprietary egress:** the owner approves sending this exact prompt/options to the authenticated provider estimate endpoint. It does not generate media. The authoritative account estimate, decimal micro-USD amount, request hash, cost basis and timestamp are saved in the existing approval result.
3. Request `media_generate` using that quote's approval ID. The server loads only this account's successful quote, verifies its original approval hash and five-minute freshness, then expands the exact prompt/model/options and **estimated USD amount** before the new Class C money approval is hashed. Callers cannot supply or override prices, account IDs or provider URLs.
4. After exact generation approval, re-estimate the identical parameters. An increase refuses dispatch and requires a fresh quote. The existing model-router account admission checks paid operator enablement, account spend/token limits, Local-Only mode and lockdown; reserves the re-estimated amount atomically under the account row lock; and consumes a deterministic quote-bound attempt key. A second attempt against the same quote cannot generate twice.
5. Submit once with that idempotency key. A response lost after send keeps a held liability and is never automatically retried. A failure proved before sending releases its reservation.
6. `media_status` takes the **generation approval ID**, never arbitrary provider request IDs. It loads a successful account-scoped generation receipt before querying the fixed provider origin. Progress and output links appear in the studio.

Quote/generation are discoverable in the standard tool set, so the existing media and branding teams can request these operations in their usual governed tool loop. A connected provider grants no execution authority. Status is a governed read; Local-Only mode denies all three media tools. The studio uses existing approval cards, including their exact-content display, expiry and server-side decision checks.

## Billing truth and remaining reconciliation

Official docs describe the authenticated account estimate for identical parameters as the authoritative amount. It is **an estimate, not a final invoice or guaranteed maximum charge**. Re-estimation rejects increases before submission; account admission reserves that amount. There is no claimed provider-enforced maximum-price parameter.

A completed status has no authoritative billed-USD receipt. Its full quoted reservation moves to **held / billing reconciliation pending**, remains counted against the account cap and is not represented as final settled spend. Resolve that hold against actual provider billing separately; the connector does not guess or silently release it. There is no automatic retry of unresolved submissions.

Official policy says `failed` and `nsfw` are not charged, and successfully `canceled` queued requests are refunded. Those terminal outcomes produce a **policy-based estimated zero-charge settlement**, explicitly not a separately verified refund receipt. Settlement locks the same account row used by spend admission, preventing concurrent aggregate reads from losing a liability. Repeated status checks are idempotent.

Provider output files normally expire seven days after completion. The studio shows output links and `expires_at`; save required assets. No automatic third-party/public upload, webhook, arbitrary URL input or local file egress is introduced.

## Configuration

Private server environment only, never source, browser storage, chat, logs or downloadable archives:

- `HIGGSFIELD_ENABLED=true` (default disabled)
- `HIGGSFIELD_ACCOUNT_USER_ID=<exact tenant account user id>`
- `HIGGSFIELD_KEY_ID=<new provider key id>`
- `HIGGSFIELD_KEY_SECRET=<provider secret>`
- `WHINK_PAID_MODELS_ENABLED=true` to admit metered generation; a credential alone grants nothing.
- `WHINK_MONTHLY_SPEND_MICROS=<positive account spend ceiling in micro-USD>`; account admission also applies existing account usage limits and outstanding holds.

Rotate any key previously exposed in chat. Provider console: <https://console.higgsfield.ai/>. HTTPS origin is fixed at `https://api.higgsfield.ai`. Missing keys, wrong account, disabled paid admission, unknown/invalid estimates, missing cap, expired/mismatched approvals or quotes, Local-Only mode, lockdown, and exhausted budget all fail closed. No live provider key, paid generation or upload was used during development.

## Official API references checked 2026-11-08

- [Authentication](https://docs.higgsfield.ai/docs/authentication): `Authorization: Key KEY_ID:KEY_SECRET`.
- [Billing and retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention): `POST /estimate/{exact-model-id}` with identical generation parameters, response `{ "usd": "decimal" }`.
- [Image](https://docs.higgsfield.ai/docs/models/qwen-image-3/text-to-image): `POST /alibaba/qwen-image-3/text-to-image`, fixed `1k`, `1:1`, thinking/prompt extension disabled.
- [Video](https://docs.higgsfield.ai/docs/models/seedance-2/text-to-video): `POST /bytedance/seedance-2.0/text-to-video`, fixed five seconds, `720p`, `16:9`, audio enabled.
- [Lifecycle](https://docs.higgsfield.ai/docs/concepts/requests): `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled`; status is `GET /requests/{request_id}/status`.
- [Usage and billing](https://docs.higgsfield.ai/docs/enterprise/usage-and-billing): analytics are estimated and not a final billing record; use invoices for reconciliation.

Transport uses fixed origin, bounded JSON reads, timeout, redirect refusal, no automatic retry, sanitized typed responses and redacted provider errors. Provider-supplied status URLs are ignored. Prompts and output URLs are omitted from ordinary media tool ledger summaries, and automatic postmortem model dispatch is disabled for these operations. Existing approval records retain exact reviewed content; external results are marked untrusted in the tool loop.

## Verification

`pnpm --dir apps/web exec vitest run lib/__tests__/higgsfield.test.ts lib/__tests__/higgsfield-routes.test.ts lib/__tests__/higgsfield-dispatch.test.ts lib/__tests__/workspace-registry.test.ts`

Mocked HTTP tests cover exact auth/request shapes, authoritative decimal estimates, account-scoped lookup, quote mutation/expiry, re-estimated price increases, admission-before-send, duplicate attempt refusal, unknown-submission holds, status ownership, policy-based refund accounting with account lock, and held completed costs. Existing protected approval and tool-loop tests also pass. Provider entitlement, actual paid generation, final invoices and Mac production runtime remain untested intentionally.
