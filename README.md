# ECHELON-INTEGRATIONS

Browser permission and organizational tier integration for the WHINK autonomous agent system.

## Overview

This repository contains the integration code for browser permissions and organization tier approval workflows for the ECHELON agent system. It is a fork of ECHELON-CORP focused on browser and org-tier integration development.

## Structure

```
src/
├── browser/
│   ├── browser-tool.ts          # Firefox automation wrapper via Playwright
│   ├── browser-tool-exec.ts     # Executable browser actions (navigate, click, type, screenshot, close)
│   └── browser-tools.ts         # OpenClaw tool definitions (all Class C)
├── lib/
│   └── org-approval.ts          # Org-tier approval logic (8 tiers, C1-H classes)
└── config/
    └── tool-classes.json        # Browser tool registrations (all Class C)
```

## Key Features

- **8-tier org approval hierarchy** (founder → Wink/Mamba → Board → ... → Agent)
- **Progressive approval classes** (C1–C7 + H founder-only)
- **URL whitelist auto-allow** (C1)
- **Team lead notification without blocking** (C2)
- **Local-only enforcement** for $0 inference cost
- **Defensive-by-default** — all browser actions Class C
- **Founder-only visibility** for money/reputational/destructive risks (H)

## Getting Started

```bash
# Install dependencies
pnpm install

# Setup Playwright (Firefox)
npx playwright install firefox

# Set environment variables
WHINK_LOCAL_ONLY=true
OLLAMA_HOST=http://<windows-ip>:11434
BROWSER_WHITELISTED_URLS=https://github.com,https://docs.openclaw.io
```

## License

Proprietary — WHINK Apps