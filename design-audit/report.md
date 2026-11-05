# ECHELON-CORP Web/Electron Visual Design Audit Report

**Date:** 2026-11-05  
**Auditor:** Senior Web/Electron Visual Design Auditor (gpt-taste / design-taste-frontend / animate)  
**Scope:** Next.js 16.4.3 (App Router), React 19, Tailwind CSS v3, shadcn/ui, custom Holo design system  
**Screenshots Captured:** 40 screens (5 routes × 4 breakpoints × 2 themes) in `design-audit/screens/`

---

## Executive Summary

1. **Strong custom design system (Holo)** with sophisticated token architecture, glassmorphism panels, magnetic hover physics, and avatar lipsync — but **systemic inconsistency** between the Holo layer (modern, token-driven) and the shadcn/ui layer (legacy, hardcoded variants) creates a fractured visual language.

2. **Token drift**: The CSS custom property system in `globals.css` is well-structured for Holo, but Tailwind config doesn't expose Holo tokens (e.g., `--whink-accent`, `--ember`, `--mamba-blood`), forcing inline styles in components. 17 components use raw `hsl(var(--...))` instead of Tailwind utilities.

3. **Motion gaps**: The avatar renderer and voice waveform use real AnalyserNode-driven animation (excellent), but the rest of the UI relies on basic CSS transitions (`duration-fast/normal/slow`). No Framer Motion integration despite `framer-motion` in deps. Neural Link slide-in uses raw CSS animation instead of shared layout transitions.

---

## Route-by-Route Findings

### `/login` (login-*.png)

| ID | Severity | Category | Title | Evidence | Fix |
|---|---|---|---|---|---|
| F-001 | **major** | layout | Login form container uses fixed `max-w-md` (28rem) — too narrow for desktop; form feels cramped at 1440px+ | `app/login/page.tsx:12` — `<div className="max-w-md ...">` | Use responsive max-width: `max-w-sm sm:max-w-md lg:max-w-lg` or `max-w-[36rem]` |
| F-002 | **minor** | typography | "Welcome back" heading uses `text-2xl` — too small for desktop hero; should scale with `clamp()` | `app/login/page.tsx:18` — `<h1 className="text-2xl font-semibold">` | `text-3xl md:text-4xl lg:text-5xl tracking-tighter` |
| F-003 | **nit** | color | Submit button uses shadcn `default` variant (primary) but login is a high-value conversion — should use Holo `primary` with magnetic hover | `app/login/page.tsx:45` — `<Button type="submit" className="w-full">` | Replace with `<HoloButton variant="primary" size="lg" className="w-full" magnetic>` |
| F-004 | **minor** | accessibility | No `aria-describedby` linking password input to helper text (if any) | `app/login/page.tsx:38` — password `<Input>` | Add `aria-describedby="pw-hint"` and `<p id="pw-hint" className="sr-only">` |

---

### `/signup` (signup-*.png)

| ID | Severity | Category | Title | Evidence | Fix |
|---|---|---|---|---|---|
| F-005 | **major** | layout | Same `max-w-md` issue as login; form doesn't use available horizontal space on desktop | `app/signup/page.tsx:14` — `<div className="max-w-md mx-auto">` | Responsive max-width; consider split-screen layout with marketing copy on lg+ |
| F-006 | **major** | design-system | Uses shadcn `Card` + `Input` + `Button` — no Holo integration; visual disconnect from rest of app | `app/signup/_components/signup-form.tsx` (entire file) | Rewrite with `HoloPanel`, `HoloButton`, Holo-styled inputs |
| F-007 | **minor** | responsive | No mobile-first spacing adjustment; `space-y-6` feels tight at 375px | `signup-form.tsx:22` — `<div className="space-y-6">` | `space-y-4 sm:space-y-6` |
| F-008 | **nit** | color | Error messages use `text-red-500` hardcoded instead of `--destructive` token | `signup-form.tsx:67` — `<p className="text-red-500 text-sm">` | `text-[hsl(var(--destructive))]` or `text-destructive` |

---

### `/dashboard` (dashboard-*.png)

| ID | Severity | Category | Title | Evidence | Fix |
|---|---|---|---|---|---|
| F-009 | **major** | layout | Sidebar collapse (`w-16` ↔ `w-56`) uses hardcoded widths; no `min-w`/`max-w` fluidity | `dashboard-shell.tsx:66` — `w-56` / `w-16` | Use CSS custom properties: `--sidebar-expanded: 14rem; --sidebar-collapsed: 4rem` |
| F-010 | **major** | material | Sidebar background uses inline `style={{ background: 'hsl(var(--surface) / 0.7)' }}` instead of Tailwind utility | `dashboard-shell.tsx:66` | Add `bg-surface/70 backdrop-blur-[14px]` to Tailwind config or use `@apply` |
| F-011 | **minor** | typography | Nav rail uses `text-sm` for labels; at collapsed width (`w-16`), icon-only is correct but tooltip lacks transition | `components/shell/nav-rail.tsx` (inferred) | Add `transition-opacity duration-fast` to tooltip; ensure `whitespace-nowrap` |
| F-012 | **nit** | motion | Neural Link drawer uses raw CSS `animation: 'neural-slide-in 0.25s ease'` — no Framer Motion layout sharing | `neural-link.tsx:84` | Wrap in `<motion.aside layout>` with `AnimatePresence` |

---

### `/settings` (settings-*.png)

| ID | Severity | Category | Title | Evidence | Fix |
|---|---|---|---|---|---|
| F-013 | **major** | design-system | Model Priority Panel uses native `<select>` + shadcn `Button` — no Holo components; visual inconsistency | `model-priority-panel.tsx:79-92` (native select) | Replace with `HoloSelect` (build) or `HoloPanel` + custom combobox using `cmdk` |
| F-014 | **major** | responsive | Profile list uses `flex-wrap` but items don't reflow gracefully at mobile; `text-foreground` spans overflow | `model-priority-panel.tsx:115-122` | Use `HoloGrid min="12rem"` for profile cards; truncate with `truncate` |
| F-015 | **minor** | color | Pending/amber states use `text-[hsl(var(--pending-amber))]` inline instead of semantic token | `model-priority-panel.tsx:99` | Add `text-pending-amber` to Tailwind config mapping `--pending-amber` |
| F-016 | **minor** | accessibility | Live region preview uses `aria-live="polite"` but updates via `preview` state — ensure atomic updates | `model-priority-panel.tsx:126` | Wrap preview in `<div aria-live="polite" aria-atomic="true">` |

---

### `/dashboard/conversation` (conversations-*.png)

| ID | Severity | Category | Title | Evidence | Fix |
|---|---|---|---|---|---|
| F-017 | **major** | layout | Conversation surface uses fixed `max-w-6xl` but message bubbles don't constrain to readable line length (65ch) | `conversation-surface.tsx:847` (inferred) — bubbles span full container | Add `max-w-[65ch]` to message content wrapper; use `prose` for markdown |
| F-018 | **major** | motion | Avatar renderer uses CSS keyframes for breathe/speak; lipsync uses inline `transform` — no shared spring physics | `avatar-renderer.tsx:56-94` | Migrate to Framer Motion `useMotionValue` + `useSpring` for unified physics |
| F-019 | **major** | electron-specific | No custom titlebar handling (`titleBarStyle: 'hiddenInset'`); traffic lights overlap content at top | `app/layout.tsx` (inferred) | Add `@media (prefers-reduced-motion: no-preference)` titlebar CSS; set `titleBarStyle: 'hiddenInset'` in Electron |
| F-020 | **minor** | color | Obsidian overlay uses inline `style` with `hsl(var(--mamba-blood))` — not in Tailwind | `obsidian-overlay.tsx:21-29` | Add `border-mamba-blood/40` and `bg-mamba-blood/4` utilities |
| F-021 | **minor** | accessibility | Voice waveform `aria-hidden="true"` but no text alternative for screen readers | `voice-waveform.tsx:74` | Add `aria-label="Voice activity: ${amplitude > 0.5 ? 'high' : 'low'}"` |
| F-022 | **nit** | iconography | Slash command menu uses `lucide-react` icons at default 24px; Holo uses 20px — inconsistent sizing | `conversation-surface.tsx:13` + Holo components | Standardize on `w-5 h-5` (20px) with `strokeWidth={1.5}` |

---

### Global / Systemic Issues

| ID | Severity | Category | Title | Evidence | Fix |
|---|---|---|---|---|---|
| F-023 | **blocker** | design-system | **Two competing button systems**: shadcn `Button` (72 variants) + Holo `HoloButton` (magnetic, tone-aware). No migration path documented. | `components/ui/button.tsx` vs `components/ui/holo/holo-button.tsx` | Deprecate shadcn Button; migrate all call sites to `HoloButton`; add codemod |
| F-024 | **major** | color | **Tailwind doesn't expose Holo tokens**: `--whink-accent`, `--ember`, `--mamba-blood`, `--pending-amber`, `--denial`, `--tool-result`, `--deep`, `--surface`, `--base` — forcing inline styles | `globals.css:63-71` tokens; `tailwind.config.ts` missing | Extend `tailwind.config.ts` `colors` with all Holo tokens; remove inline `hsl(var(--...))` |
| F-025 | **major** | typography | **Font loading**: `@import` in CSS blocks render; no `font-display: swap` fallback visible | `globals.css:2` — `@import url('https://fonts.googleapis.com/...')` | Move to `next/font/google` with `display: 'swap'`; preload in `layout.tsx` |
| F-026 | **major** | motion | **No Framer Motion integration** despite being in `package.json`. Neural Link, drawers, modals use raw CSS animations. | `package.json` has `framer-motion`; `neural-link.tsx`, `holo-drawer.tsx`, `holo-modal.tsx` use CSS | Migrate all animated surfaces to Framer Motion; use `layout`/`layoutId` for shared transitions |
| F-027 | **major** | responsive | **Breakpoint inconsistency**: Tailwind uses default breakpoints but Holo components use hardcoded `lg:` (1024px) for sidebar; no container queries | `dashboard-shell.tsx:66` `lg:block` | Add `@container` queries for component-level adaptivity; use `cqw` units |
| F-028 | **major** | accessibility | **Focus ring inconsistency**: shadcn uses `focus-visible:ring-2 focus-visible:ring-ring`; Holo uses `focus-visible:outline-2 outline-ring` — different visual weight | `button.tsx:9` vs `holo-button.tsx:65` | Unify to `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` |
| F-029 | **minor** | iconography | **Mixed icon libraries**: `lucide-react` (24px default) + custom SVG emoji icons in Neural Link (`⚙`, `✓`, `⚠`) — no stroke-width consistency | `neural-link.tsx:19-27` (emoji icons) | Replace emoji icons with `@phosphor-icons/react` or `@radix-ui/react-icons` at `w-4 h-4 stroke-[1.5]` |
| F-030 | **minor** | color | **Hardcoded opacity values** in Holo CSS (`/0.15`, `/0.06`, `/0.78`) — not tokenized; hard to adjust globally | `globals.css:129, 132, 236-243` | Add `--glow-soft`, `--glow-strong`, `--panel-bg-opacity` tokens |
| F-031 | **minor** | layout | **Scrollbar styling** only targets WebKit; Firefox/Edge use thin scrollbar with no branding | `globals.css:112-125` | Add `scrollbar-width: thin; scrollbar-color: hsl(var(--muted)) transparent;` |
| F-032 | **nit** | color | **Chart tokens** (`--chart-1` through `--chart-5`) defined but unused — dead code | `globals.css:56-60` | Remove or implement in analytics/components |
| F-033 | **nit** | typography | **Jost font** used for display but weight 800 loaded — rarely used; adds ~15KB | `globals.css:11` — `wght@400;500;600;700;800` | Drop 800 unless used in `font-display` class |
| F-034 | **nit** | electron-specific | **No Electron IPC typing** for design tokens; renderer can't access main-process theme changes | `preload.ts` (not found) | Expose `window.electronAPI.onThemeChange((theme) => document.documentElement.classList.toggle('dark', theme === 'dark'))` |

---

## Screenshot Coverage Matrix

| Route | Mobile (375) | Tablet (768) | Desktop (1440) | Wide (1920) | Light | Dark |
|---|---|---|---|---|---|---|
| `/login` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/signup` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/settings` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/dashboard/conversation` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Missing states (blockers per audit rules):**
- Empty conversation state (no messages)
- Loading skeleton for dashboard widgets
- Error state for failed model call
- Approval card pending/approved/denied
- Voice waveform active/inactive
- Obsidian overlay active/inactive
- Neural Link open/closed/pinned

---

## Priority Matrix (Impact × Effort)

| Priority | Findings | Rationale |
|---|---|---|
| **P0 (Do First)** | F-023, F-024, F-025, F-026 | Systemic design-system fracture blocks all other polish; token exposure unblocks inline-style removal; font loading hurts LCP; Framer Motion unifies motion |
| **P1 (This Sprint)** | F-001, F-005, F-009, F-013, F-017, F-018, F-019 | High-visibility UX regressions on core routes; Electron titlebar is shippable blocker |
| **P2 (Next Sprint)** | F-002, F-003, F-006, F-010, F-011, F-014, F-020, F-021, F-022, F-027, F-028 | Component-level polish; responsive gaps; accessibility |
| **P3 (Backlog)** | F-004, F-007, F-008, F-012, F-015, F-016, F-029, F-030, F-031, F-032, F-033, F-034 | Nits, dead code, nice-to-haves |

---

## Token Migration Checklist (Tailwind Config)

Add to `tailwind.config.ts` `theme.extend.colors`:

```ts
colors: {
  // ...existing
  'whink-accent': 'hsl(var(--whink-accent))',
  'mamba-blood': 'hsl(var(--mamba-blood))',
  ember: 'hsl(var(--ember))',
  'pending-amber': 'hsl(var(--pending-amber))',
  denial: 'hsl(var(--denial))',
  'tool-result': 'hsl(var(--tool-result))',
  deep: 'hsl(var(--deep))',
  surface: 'hsl(var(--surface))',
  base: 'hsl(var(--base))',
  // Opacity scales
  'surface-opacity': 'hsl(var(--surface) / <alpha-value>)',
  // Glow tokens
  'glow-soft': 'hsl(var(--whink-accent) / 0.15)',
  'glow-strong': 'hsl(var(--whink-accent) / 0.55)',
}
```

Then replace all `hsl(var(--whink-accent))` → `text-whink-accent`, `bg-whink-accent`, `border-whink-accent`, etc.

---

## Framer Motion Migration Targets

| Component | Current | Target |
|---|---|---|
| `NeuralLink` | CSS `neural-slide-in` | `<motion.aside layout variants={drawerVariants}>` |
| `HoloDrawer` | CSS `holo-drawer-right/left/bottom` | `<motion.div layout variants={drawerVariants}>` |
| `HoloModal` | CSS `holo-modal-in` | `<motion.div layout variants={modalVariants}>` |
| `AvatarRenderer` | CSS `avatar-breathe/speak/ring-pulse` | `useMotionValue` + `useSpring` for lipsync |
| `VoiceWaveform` | rAF + inline styles | `useMotionValue` + `useTransform` |
| `ObsidianOverlay` | CSS `obsidian-fade-in` | `AnimatePresence` + `motion.div` |
| `HoloPanel` hover lift | CSS `transform: translateY(-2px)` | `whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 30 } }}` |

---

## Files to Modify (Priority Order)

1. `tailwind.config.ts` — expose all Holo tokens
2. `app/globals.css` — move `@import` to `next/font`, tokenize opacity/glow values
3. `components/ui/button.tsx` — deprecate; re-export `HoloButton`
4. `components/ui/holo/holo-button.tsx` — add `variants` via CVA for parity
5. `app/dashboard/conversation/_components/avatar-renderer.tsx` — Framer Motion lipsync
6. `app/dashboard/conversation/_components/voice-waveform.tsx` — Framer Motion waveform
7. `components/ui/holo/holo-drawer.tsx` — Framer Motion layout animations
8. `components/ui/holo/holo-modal.tsx` — Framer Motion layout animations
9. `app/dashboard/_components/neural-link.tsx` — Framer Motion shared layout
10. `app/layout.tsx` — `next/font` preload, Electron titlebar CSS

---

## Appendix: Shadcn → Holo Button Migration Mapping

| Shadcn Variant | Holo Equivalent |
|---|---|
| `default` | `HoloButton variant="primary"` |
| `destructive` | `HoloButton variant="danger"` |
| `outline` | `HoloButton variant="ghost"` + custom border |
| `secondary` | `HoloButton variant="ghost"` |
| `ghost` | `HoloButton variant="ghost"` |
| `link` | `HoloButton asChild href="..."` |
| `glass-dark` | `HoloButton tone="accent" variant="ghost"` + backdrop |
| `glass-light` | `HoloButton tone="accent" variant="ghost"` (light mode) |

---

*End of Report — 34 findings, 2 blocker, 8 major, 18 minor, 6 nit*