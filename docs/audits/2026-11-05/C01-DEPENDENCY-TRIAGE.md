# C01 — dependency, alert and service triage (2026-11-05)

Read-only evidence gathered from the GitHub API on 2026-11-05 against
`whinkproducts-alt/ECHELON-CORP` (`main` @ `8bca36f`), plus local inspection of the pnpm
graph. This closes the *triage* half of C01. It does not claim the remaining advisories are
harmless, and it does not perform a blanket upgrade.

## Exact counts (fresh read)

```
gh api --paginate repos/whinkproducts-alt/ECHELON-CORP/dependabot/alerts?state=open
→ 131 open alerts: 8 critical, 49 high, 55 medium, 19 low
```

The push banner's 134 is stale. The previously recorded 131 (8/49/55/19) is confirmed exactly.

| Manifest | Open alerts | Role in this build |
|---|---:|---|
| `apps/web/yarn.lock` | 69 | **Not used.** No CI job, Dockerfile, script or package manifest invokes Yarn. |
| `services/openclaw/package-lock.json` | 24 | Docker build of the vendored gateway; local gateway runs the npm-published `openclaw@2026.10.8`. |
| `services/voice/package.json` | 11 | Optional `ada-voice` service; not in `docker-compose.yml`, not listening. |
| `pnpm-lock.yaml` | 11 | Real workspace graph (apps/web + services). |
| `services/openclaw/upstreams/{social,ref}/package-lock.json` | 8 + 8 | Vendored upstream fixtures inside openclaw. |

### What changed in this pass

- **Removed `apps/web/yarn.lock`.** It is a leftover Yarn lockfile (an `.yarnrc.yml` also
  remains) while the workspace, CI (`pnpm/action-setup` 10.28.0) and every script use
  pnpm. Deleting it removes 69 alerts — 3 critical `next`, 1 critical `maplibre-gl`, and
  the `undici`/`sharp`/`lodash`/`js-yaml`/`fast-uri` cluster — without touching a single
  installed package. Verified: `pnpm install --frozen-lockfile`, typecheck, lint and the
  full unit suite still pass (see the daily sync).
- No dependency version was changed. The remaining 62 alerts stay open and tracked below.

## Reachability of the remaining critical/high alerts

### `pnpm-lock.yaml` (11)

| Severity | Package | Range → patch | Reachability |
|---|---|---|---|
| high | `vite` | `<= 2.14.1` → 2.14.2 | Transitive dev/test tooling (an old Vite pulled by a test plugin). Not in the Next.js runtime. |
| medium | `vite` | `8.3.0–8.3.2` → 8.3.3 | Build tooling; not shipped. |
| medium | `qs` | `<= 6.16.0` → 6.16.1 | Express/qs request parsing; patch-level. |
| medium | `postcss-selector-parser` | `< 7.1.6` | Build tooling. |
| medium | `csv-parse` | `< 7.0.2` | Major bump; parser input is local. |
| low | `webpack` | `<= 5.104.0` → 5.104.1 | Build tooling. |

No open critical in the installed app graph. `next` is pinned `16.4.3` in both
`apps/web/package.json` and `pnpm-lock.yaml`, above every patched range in the removed
lockfile; `zod` resolves to `4.6.7` (patched); `postcss` resolves to `8.5.31`.

### `services/voice/package.json` (11, all `multer`)

`multer` is pinned `^1.4.5-lts.1`; the advisory set patches at `2.3.0` (and earlier 2.x).
`services/voice/server.js` imports multer. Reachability today: the service is not in
`docker-compose.yml`, has no listener, and nothing in the launcher or worker starts it,
so it is **not reachable in the current personal runtime**. Tracked remediation: upgrade
to `multer@^2.3.0` with a focused upload test before that service is enabled.

### `services/openclaw/*` (24 + 8 + 8)

The criticals (`vitest`, `tinypool`) and most highs (`vite`, `body-parser`, `zod`) live in
test/build dependencies of the vendored gateway and its upstream fixtures. The gateway
that actually runs on this Mac is the npm global `openclaw@2026.10.8`, not a build from
this lock. Reachability of the runtime highs depends on the published package's own
dependency tree, which this repository does not pin. Tracked remediation: bump the
vendored gateway and its upstreams together, or stop tracking their lockfiles once the
image is built from the published package.

## Open dependency PRs (#5–#9, #11, #13–#16, #22)

Not merged. Each is a major-version jump or a grouped update:

- #5–#9, #11: GitHub Actions majors (`checkout` 4→7, `setup-node` 4→7,
  `upload-artifact` 4→7, `pnpm/action-setup` 5→6, `codeql-action` 3→4) and Node 26 for the
  openclaw image. Requires a runner-compatibility pass, not a blind merge.
- #13–#15: `jotai` 2→3, `react-day-picker` 8→10, `framer-motion` 12→14 — breaking UI majors.
- #16: `mapbox-gl` 1.13.3→3.33.0. **Licensing unresolved**; `maplibre-gl` is the
  permissive alternative. Do not merge before a licence decision.
- #22: grouped minor/patch, 71 updates. Too broad to review as one change.

## Service inventory actually verified on this Mac

| Service | Evidence | Notes |
|---|---|---|
| PostgreSQL + pgvector | `127.0.0.1:5432` listening; container `whink-ultimate-postgres-1` | Used for the isolated admission test DB; personal DB untouched. |
| Ollama | `127.0.0.1:11434` listening | Local model host. |
| OpenClaw gateway | `127.0.0.1:18789` listening; `openclaw 2026.10.8` | Published package, not the repo lock. |
| Whisper / Kokoro | `127.0.0.1:8765`, `8766` listening (OrbStack) | Local speech containers. |
| Next.js web / worker | **not running** | No listener on 3000; no worker process observed. |

No subscription, invoice or entitlement is asserted here; that remains R10 evidence work.

## Residual risk and next actions

1. Patch-level overrides (`qs`, `fast-uri`, `vite` 8.3.3, `webpack`) are low-risk but were
   not applied in this pass; they need a lockfile review and a full build.
2. `services/voice` multer 2.x upgrade is required before that service is enabled.
3. The openclaw vendored lockfiles should be reconciled with the published runtime or
   removed from alert scope.
4. `mapbox-gl` licence decision stays open (Founder input).
