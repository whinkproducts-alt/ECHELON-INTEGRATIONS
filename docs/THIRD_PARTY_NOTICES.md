# Third party notices

Licence policy: MIT, Apache 2.0, BSD or ISC only. Anything else needs Victor's approval first. Upstream copyright notices stay intact. This file lists the MCP gateway (`services/openclaw`). Add other services as they land.

## MCP gateway (`services/openclaw`)

| Component | Where | Licence | Notes |
|---|---|---|---|
| `@modelcontextprotocol/sdk` 1.32.0 | Gateway runtime dependency (also in product images) | MIT | Copyright Anthropic, PBC. |
| `@modelcontextprotocol/server-everything` 2026.8.31 | Dev only. Installed from `services/openclaw/upstreams/ref/` when the image is built with `INCLUDE_REF_SERVER=true` | MIT (the MCP project is moving to Apache-2.0; both allowed) | Not in product images. The npm package ships no LICENSE file, so the upstream repo licence is recorded here. |
| `jszip` 3.10.2 | Dev only, transitive of `server-everything` | `MIT OR GPL-3.0-or-later`, MIT elected | Dev-only exception approved by Victor Igboekwe, 2026-10-03 (relayed). Absent from product images. |
| `pako` 1.0.11 | Dev only, transitive of `server-everything` | `MIT AND Zlib` | Zlib is permissive but is not on the allowed list. Dev-only exception approved by Victor Igboekwe, 2026-10-03 (relayed). Absent from product images. |
| Node.js 22 / `node:22-alpine` base image | Container base | MIT (Node.js); Alpine packages include GPL-2.0 components (for example busybox, musl is MIT) | Alpine components are used unmodified, unlinked, as separate programs in the OS layer. Not combined with WHINK code. |
| Dev tooling (`typescript` Apache-2.0, `vitest` MIT, `@types/node` MIT) | Dev dependencies only | As listed | Not shipped. |

Verify the product image has no dev-only code: `docker build --build-arg INCLUDE_REF_SERVER=false` then check `/app/upstreams` is empty and `npm ls --omit=dev` lists only the MCP SDK and its dependencies.

## Operator-configured MCP servers

MCP servers that an operator adds through `config/servers.json` or `config/local/servers.json` (for example `ghcr.io/github/github-mcp-server`, MIT) are not part of WHINK. The operator is responsible for checking each one's licence, keeping its notices, and approving its tools. The gateway never bundles them.
