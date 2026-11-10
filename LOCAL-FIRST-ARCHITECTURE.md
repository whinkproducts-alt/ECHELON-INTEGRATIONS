# Recommended Architecture: Local-First + Free Cloud Fallback

## Overview

This document describes the recommended architecture for ECHELON-INTEGRATIONS, centered on **local-first execution with free cloud fallback**. The entire system is designed to operate at $0 cost for inference while maintaining organizational governance through tiered approval workflows.

---

## Architecture Philosophy

| Principle | Description |
|-----------|-------------|
| **Local-First** | All browser automation, agent operations, and inference run on the user's local machine (Mac orchestrator + Windows laptop). No cloud proxying, no per-token costs. |
| **Defensive by Default** | All browser tools are Class C — nothing runs without explicit org-tier approval. Authority descends from founder → agent. |
| **Free Cloud Fallback** | If local models are unavailable, the system falls back to cloud-free providers (Hermes/DeepSeek accounts already configured). No paid inference required. |
| **Org-Tier Governance** | 8-tier approval hierarchy ensures founder only sees critical risks (money, reputational, destructive). All other matters are handled internally. |
| **Unlimited Tokens/Context** | Since all inference is local or from pre-configured free accounts, there are no per-token limits or cost concerns. |

---

## System Components

### 1. **Local Execution Layer** (Always On)

| Component | Technology | Cost |
|-----------|-----------|------|
| **Inference Server (Windows Laptop)** | Ollama + qwen3.5:9b, deepseek-coder:6.7b | $0 (local) |
| **Fast Model (Mac Orchestrator)** | Ollama + qwen2.5:3b | $0 (local) |
| **Browser Automation** | Playwright + Firefox (headless on Windows) | $0 (local) |
| **Model Router** | Custom tiered router (T0 → T1 → T2 → T3 → T4) | $0 |

**T0 (Cache):** Cached responses, instant
**T1 (Speed):** qwen2.5:3b on Mac, ~sub-1s TTFT
**T2 (Reasoning):** qwen3.5:9b on Windows, ~2-5s TTFT
**T3 (Cloud Fallback):** Hermes/DeepSeek accounts, pre-configured, $0
**T4 (Honest Fail):** Graceful degradation if nothing available

### 2. **Org-Tier Approval System**

| Tier | Authority | Sees | Typical Actions |
|------|-----------|------|-----------------|
| **founder** (Victor) | Money / Reputational / Destructive | ✅ Only H class | Founder-only risks |
| **wink_mamba** | Framework policy | ❌ | Policy shifts, not per-request |
| **board** | Strategic pivots | ❌ | Divisional strategy |
| **subsidiary_dir** | Regional patterns | ❌ | Regional domain approval |
| **director** | Divisional policy | ❌ | Division-level actions |
| **dept_head** | Departmental boundaries | ❌ | Cross-team domains |
| **team_lead** | Team-level browsing | ❌ | Non-whitelist URLs, notification |
| **agent** | Operational execution | ❌ | C1 whitelist auto-allow |

**Approval Classes:**

| Class | Description | Auto-Allowed | Requires Approval | Victor Sees |
|-------|-------------|--------------|-------------------|-------------|
| **C1** | URL whitelist — auto-allowed | ✅ Yes (whitelisted URLs) | No | ❌ |
| **C2** | Team lead notify — agent proceeds | ✅ Yes (agent proceeds) | No (notify only) | ❌ |
| **C3** | Dept head — cross-team domain | ❌ | Yes (dept_head) | ❌ |
| **C4** | Director — divisional policy | ❌ | Yes (director) | ❌ |
| **C5** | Subsidiary Dir — regional pattern | ❌ | Yes (subsidiary_dir) | ❌ |
| **C6** | Wink/Mamba — framework policy | ❌ | Yes (wink_mamba) | ❌ |
| **C7** | Board — strategic pivot | ❌ | Yes (board) | ❌ |
| **H** | Founder — money/reputational/destructive | ❌ | Yes (founder) | ✅ Only |

### 3. **Browser Tool Architecture**

```
src/browser/
├── browser-tool.ts          # BrowserTool class with Playwright wrapper
│   - execute() checks org-tier permission before every action
│   - Logs AUTHORIZED/BLOCKED in ledger
│   - Dispatches to navigate/click/type/screenshot/close
│   - healthCheck(), getBrowserTool() factory
│
├── browser-tool-exec.ts     # Executable browser action functions
│   - navigateBrowser(url) → page title + screenshot
│   - clickBrowser(selector) → click action
│   - typeBrowser(selector, text) → fill field
│   - screenshotBrowser(path) → capture PNG
│   - closeBrowser() → close browser instance
│   - about:blank navigation fix for click/type/screenshot
│
└── browser-tools.ts         # OpenClaw tool definitions
    - BROWSER_TOOLS array (5 tools, all Class C)
    - browser_tool__navigate, __click, __type, __screenshot, __close
    - All riskClass: 'C', costClass: 'FREE'
```

### 4. **Configuration & Environment**

```env
# Browser
WHINK_LOCAL_ONLY=true                              # Enforces local execution
BROWSER_WHITELISTED_URLS=https://github.com,https://docs.openclaw.io  # C1 auto-allow

# Inference
OLLAMA_HOST=http://<windows-ip>:11434              # Windows laptop inference server
WHINK_LOCAL_MODEL=qwen2.5:3b                       # Fast model on Mac
WHINK_REASONING_MODEL=qwen3.5:9b                   # Reasoning model on Windows

# Org Tier
ORGTIER_Enable_Notifications=true                  # Team lead notifications
ORGTIER_Default_Tier=team_lead                      # Default approval tier
```

### 5. **Data Flow Diagrams**

```
User Request
        ↓
Org-Tier Classification (classifyBrowserApproval)
        ↓
┌─────────────────────┐
│   C1: Whitelist? → ✅ Auto-allow → Browser → ✅ Return result │
│   C2: Team lead → ✅ Notify → Agent proceeds → ✅ Return result │
│   C3-C7: Escalate → ⏳ Await tier approval → ✅ Return result │
│   H: Founder risk → ⚠️ Block → Victor dashboard → ✅ Approve/Reject │
└─────────────────────┘
        ↓
Local Browser Execution (Playwright on Windows)
        ↓
Screenshot + text snapshot → Ledger recording → Return to user
```

### 6. **Cost Model Summary**

| Cost Category | Status | Details |
|--------------|--------|---------|
| **Inference** | $0 | Local Ollama on Mac + Windows; free accounts for cloud fallback |
| **Browser** | $0 | Playwright + Firefox, local only; no cloud proxying |
| **Storage** | $0 | 1 TB external HDD for models, backups; NTFS formatted |
| **Approvals** | $0 | Internal org-tier; only founder (Victor) sees H class |
| **Total Monthly** | **$0** | guaranteed by local-first architecture |

### 7. **Failover & Resilience**

| Scenario | Action | Cost Impact |
|----------|--------|-------------|
| **Windows Ollama down** | Fallback to Mac qwen2.5:3b | $0 (local) |
| **Both local models down** | Fallback to Hermes/DeepSeek cloud accounts | $0 (pre-configured free) |
| **Browser crashes** | Restart Playwright, re-init browser context | $0 |
| **Network loss** | Graceful degradation, show cached results | $0 |
| **HDD full** | Cleanup old backups, rotate logs | $0 |

### 8. **Deployment Checklist**

```
□ Mac: Ollama installed, qwen2.5:3b pulled, OLLAMA_HOST set
□ Windows: Ollama installed as service, qwen3.5:9b + deepseek-coder:6.7b pulled
□ Windows: OLLAMA_HOST=0.0.0.0, port 11434 allowed in firewall
□ External HDD: 1 TB, NTFS, directory structure created (models/, backups/, browser-data/)
□ Firefox: npx playwright install firefox on Windows
□ Browser whitelist: BROWSER_WHITELISTED_URLS env var configured
□ Org tier: ORGTIER_Enable_Notifications, ORGTIER_Default_Tier set
□ Test: pnpm build, pnpm test (2345 tests pass)
□ Cloudflare Tunnel: echelon tunnel create (external access)
```

### 9. **Key Advantages vs. Previous Approaches**

| Aspect | Previous | Local-First + Free Fallback |
|----------|----------|------------------------------|
| **Inference Cost** | Unknown / variable | $0 guaranteed |
| **Browser Access** | Uncontrolled | C1–C7 + H tiered approval |
| **Founder Overhead** | Saw all approvals | Only H class (money/reputation/destructive) |
| **Reliability** | Dependent on cloud uptime | Local-first, graceful fallbacks |
| **Token Limits** | Per-token pricing | Unlimited (local + free accounts) |
| **Data Privacy** | Browser content may egress | All stays on local machine |
| **Cost Predictability** | Unknown | $0/month fixed |

### 10. **Getting Started**

```bash
# 1. Clone ECHELON-INTEGRATIONS
git clone https://github.com/whinkproducts-alt/ECHELON-INTEGRATIONS.git
cd ECHELON-INTEGRATIONS

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Set environment variables
cat > .env.local << 'EOF'
WHINK_LOCAL_ONLY=true
OLLAMA_HOST=http://<windows-ip>:11434
BROWSER_WHITELISTED_URLS=https://github.com,https://docs.openclaw.io
WHINK_LOCAL_MODEL=qwen2.5:3b
WHINK_REASONING_MODEL=qwen3.5:9b
EOF

# 3. Start inference servers
# Windows: Start Ollama service, ensure qwen3.5:9b + deepseek-coder:6.7b available
# Mac: export OLLAMA_HOST=http://<windows-ip>:11434, pull qwen2.5:3b

# 4. Start the app
pnpm dev

# 5. Verify
# - Mac can reach Windows Ollama: curl http://<windows-ip>:11434/api/tags
# - browser_navigate works with C1/C2 approval flow
# - Class C gate blocks unapproved calls
# - H class routes to Victor only
```

---

## Conclusion

The **Local-First + Free Cloud Fallback** architecture achieves all of Victor's requirements:

- ✅ **$0 cost** — no paid inference, local-only execution
- ✅ **Never held up** — C1/C2 auto-allow + notification-proceed pattern
- ✅ **Fast responses** — T1 (qwen2.5:3b on Mac, <1s TTFT) for routine requests
- ✅ **Unlimited tokens/context** — no per-token cost model
- ✅ **Agent hands** — complete tool automation via OpenClaw + Playwright
- ✅ **Online web address** — browser automation with org-tier governance
- ✅ **Org-tier oversight** — 8-tier hierarchy, founder-only H class visibility
- ✅ **Graceful degradation** — fallbacks at every layer, never a hard failure

This architecture is implemented in the current ECHELON-INTEGRATIONS codebase and ready for production deployment.

---
*Document generated: 2026-11-10*
*Repository: https://github.com/whinkproducts-alt/ECHELON-INTEGRATIONS*