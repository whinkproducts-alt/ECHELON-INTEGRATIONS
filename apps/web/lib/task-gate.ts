/**
 * WHINK Org-Kit Task Gate
 *
 * Intercepts user messages that constitute task directives and routes them
 * through the Execution Authorization Request pattern before any AI execution.
 *
 * RULE: Every task that requires an org-kit agent produces an EAR.
 *       Execution is blocked until Victor (Kaycee) approves.
 */

import { buildAuthorizationRequest, type ExecutionAuthorizationRequest } from "@whink/org-kit";

// ── Task signal detection ─────────────────────────────────────────────────────

/**
 * Patterns that signal a directive / task request rather than a conversation.
 * Ordered from strongest to weakest signal.
 */
const TASK_DIRECTIVE_PATTERNS: RegExp[] = [
  // Explicit /task or /execute slash commands
  /^\/task\b/i,
  /^\/execute\b/i,
  /^\/run\b/i,
  /^\/launch\b/i,
  /^\/deploy\b/i,
  // Strong imperative openers
  /^(build|create|write|draft|design|develop|implement|set up|set-up|generate|produce|launch|plan|prepare|research|analyze|analyse|audit|review|report|compile|collect|source|find|hire|recruit|onboard|close|pitch|negotiate|execute|run|ship|deliver|coordinate|manage|lead)\s+/i,
  // "I need you to / I want you to / Can you" + action verb
  /\b(i need you to|i want you to|please|can you|could you)\s+(build|create|write|draft|design|develop|implement|set\s*up|generate|produce|launch|plan|prepare|research|analyze|audit|review|compile|find|hire|recruit|close|pitch|negotiate|execute|coordinate|manage|lead)\b/i,
];

/** Minimum word count before we treat something as a task (avoids catching short questions). */
const MIN_TASK_WORD_COUNT = 6;

export function isTaskDirective(message: string): boolean {
  const words = message.trim().split(/\s+/).length;
  if (words < MIN_TASK_WORD_COUNT) return false;
  return TASK_DIRECTIVE_PATTERNS.some((re) => re.test(message.trim()));
}

// ── Skill extraction ──────────────────────────────────────────────────────────

/**
 * Lightweight keyword → skill_id mapping.
 * The full skill registry has 570 entries; this covers the most common domains.
 * Router will surface capability_gaps for anything not matched.
 */
const KEYWORD_SKILL_MAP: Array<{ keywords: RegExp; skill: string }> = [
  { keywords: /\b(product|roadmap|feature|backlog|sprint|mvp)\b/i, skill: "product_strategy" },
  { keywords: /\b(brand|rebrand|identity|logo|visual identity)\b/i, skill: "brand_strategy" },
  { keywords: /\b(market|marketing|demand|growth|acquisition|funnel|leads?)\b/i, skill: "demand_generation" },
  { keywords: /\b(project|timeline|milestone|gantt|scope|workback)\b/i, skill: "project_decomposition" },
  { keywords: /\b(code|coding|engineer|engineering|software|dev|api|backend|frontend|fullstack)\b/i, skill: "software_engineering" },
  { keywords: /\b(data|analytics|metric|kpi|dashboard|bi|reporting)\b/i, skill: "data_analysis" },
  { keywords: /\b(ai|machine learning|ml|model|llm|nlp|genai)\b/i, skill: "ai_ml_engineering" },
  { keywords: /\b(design|ux|ui|user experience|figma|prototype|wireframe)\b/i, skill: "ux_ui_design" },
  { keywords: /\b(content|copy|copywriting|blog|article|email|newsletter)\b/i, skill: "content_creation" },
  { keywords: /\b(social|social media|instagram|twitter|linkedin|tiktok)\b/i, skill: "social_media_management" },
  { keywords: /\b(seo|search engine|organic|keywords?|ranking)\b/i, skill: "seo_strategy" },
  { keywords: /\b(sales|revenue|deal|pipeline|crm|close|quota)\b/i, skill: "sales_strategy" },
  { keywords: /\b(finance|financial|budget|forecast|p&l|cash flow|model)\b/i, skill: "financial_modeling" },
  { keywords: /\b(legal|contract|agreement|compliance|gdpr|terms|privacy)\b/i, skill: "legal_compliance" },
  { keywords: /\b(hr|hire|hiring|recruit|talent|onboard|culture|people)\b/i, skill: "talent_acquisition" },
  { keywords: /\b(ops|operations|process|workflow|sop|supply chain|vendor)\b/i, skill: "operations_management" },
  { keywords: /\b(customer|support|cx|service|retention|churn|nps)\b/i, skill: "customer_success" },
  { keywords: /\b(security|cyber|penetration|vuln|compliance|iso|soc2)\b/i, skill: "cybersecurity" },
  { keywords: /\b(infra|infrastructure|cloud|aws|gcp|azure|devops|k8s|docker)\b/i, skill: "cloud_infrastructure" },
  { keywords: /\b(research|competitive|landscape|market research|intel)\b/i, skill: "market_research" },
  { keywords: /\b(strategy|strategic|vision|direction|north star|goal)\b/i, skill: "strategic_planning" },
  { keywords: /\b(partner|partnership|business development|biz dev|alliance)\b/i, skill: "business_development" },
  { keywords: /\b(pr|public relations|press|media|journalist|pitch)\b/i, skill: "public_relations" },
  { keywords: /\b(investor|fundraise|raise|seed|series|deck|pitch deck|vc)\b/i, skill: "investor_relations" },
  { keywords: /\b(event|launch event|conference|webinar|demo day)\b/i, skill: "event_management" },
];

export function extractRequiredSkills(message: string): string[] {
  const matched = new Set<string>();
  for (const { keywords, skill } of KEYWORD_SKILL_MAP) {
    if (keywords.test(message)) matched.add(skill);
  }
  // Always include baseline skills for any real task
  if (matched.size > 0) {
    matched.add("web_research");
    matched.add("quality_review");
  }
  return [...matched];
}

// ── Gate entry point ──────────────────────────────────────────────────────────

export interface TaskGateResult {
  intercepted: true;
  ear: ExecutionAuthorizationRequest;
  formattedResponse: string;
}

export interface TaskGatePass {
  intercepted: false;
}

export type TaskGateOutcome = TaskGateResult | TaskGatePass;

export function runTaskGate(
  message: string,
  persona: string = "WHINK"
): TaskGateOutcome {
  if (!isTaskDirective(message)) return { intercepted: false };

  const requiredSkills = extractRequiredSkills(message);
  if (requiredSkills.length === 0) return { intercepted: false };

  const ear = buildAuthorizationRequest(message.substring(0, 300), requiredSkills, {
    maxAgents: 5,
  });

  const formattedResponse = formatEAR(ear, persona);

  return { intercepted: true, ear, formattedResponse };
}

// ── EAR formatter ─────────────────────────────────────────────────────────────

function formatEAR(ear: ExecutionAuthorizationRequest, persona: string): string {
  const gapNote =
    ear.capability_gaps.length > 0
      ? `\n⚠️ **Capability gaps detected:** ${ear.capability_gaps.join(", ")} — new agent creation or skill assignment required.\n`
      : "";

  const supporting =
    ear.supporting_agents.length > 0
      ? ear.supporting_agents.map((a) => `  • ${a}`).join("\n")
      : "  • (Lead agent operating solo)";

  const header = persona === "MAMBA"
    ? `🐍 **MAMBA — EXECUTION AUTHORIZATION REQUEST**`
    : `⚡ **WHINK — EXECUTION AUTHORIZATION REQUEST**`;

  return `${header}

**Status:** ${ear.status}
**Objective:** ${ear.objective}

---

**Proposed Team**
- **Lead Agent:** ${ear.lead_agent ?? "None available — see gaps below"}
- **Supporting Agents:**
${supporting}
- **Team Size:** ${ear.team_size}

**Coverage**
${ear.why_sufficient}
${gapNote}
**Required Skills:** ${ear.required_skills.join(", ")}

**Schedule:** ${ear.schedule}
**Budget:** ${ear.estimated_budget}

${ear.risks.length > 0 ? `**Risks:** ${ear.risks.join("; ")}\n` : ""}
---

> 🔐 **Execution is blocked.** This request requires your explicit approval before any agent acts.
> Reply **"Approved"** to authorize, or specify changes to the team, scope, or schedule.`;
}
