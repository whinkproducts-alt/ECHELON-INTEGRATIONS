import { prisma } from '@/lib/db';
import { generateCorrelationId } from '@/lib/logger';
import { checkPermission, type PermissionClass } from '@/lib/permission-engine';
import { writeMemory, correctMemory, searchMemory } from '@/lib/memory-engine';
import { listOpenClawTools, callOpenClawTool } from '@/lib/openclaw-client';
import dns from 'dns';
import net from 'net';

// ── SSRF protection helpers ──────────────────────────────────────────────────

function isPrivateAddress(ip: string): boolean {
  // IPv6 loopback/ULA/link-local
  if (ip === '::1') return true;
  if (/^fe80:/i.test(ip)) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true; // ULA fc00::/7

  if (!net.isIPv4(ip)) return false; // unknown format — allow (non-IPv4 IPv6 handled above)

  const parts = ip.split('.').map(Number);
  const [a, b] = parts;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16
  if (a === 169 && b === 254) return true;

  return false;
}

async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  const isDev = process.env.NODE_ENV === 'development';
  const hostname = parsed.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (parsed.protocol !== 'https:') {
    if (isDev && isLocalhost && parsed.protocol === 'http:') {
      return; // allow http://localhost and http://127.0.0.1 in dev only
    }
    throw new Error('Only https: URLs are allowed');
  }

  // Resolve hostname and check for private addresses
  const { address } = await dns.promises.lookup(hostname);
  if (isPrivateAddress(address)) {
    throw new Error(`URL resolves to a private/reserved address: ${address}`);
  }
}

const MAX_WEB_FETCH_BYTES = 100 * 1024; // 100 KB

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  source?: string;
  timestamp: string;
  toolVersion: string;
}

// Use null-prototype objects to prevent __proto__ injection
const TOOL_HANDLERS: Record<string, (userId: string, params: any) => Promise<ToolExecutionResult>> = Object.assign(Object.create(null), {
  memory_write: async (userId: string, params: any) => {
    const result = await writeMemory({
      userId,
      type: params.type ?? 'semantic',
      statement: params.statement,
      projectId: params.projectId,
      source: params.source ?? 'conversation',
      confidence: params.confidence,
      epistemicStatus: params.epistemicStatus ?? 'KNOWN',
      eventType: params.eventType,
    });
    return { success: true, data: result, source: 'memory_engine', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  memory_read: async (userId: string, params: any) => {
    const result = await searchMemory(userId, params.query, params.projectId, params.limit);
    return { success: true, data: result, source: 'memory_engine', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  memory_correct: async (userId: string, params: any) => {
    const result = await correctMemory(userId, params.oldStatement, params.newStatement, params.projectId);
    return { success: true, data: result, source: 'memory_engine', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  entity_create: async (userId: string, params: any) => {
    const entity = await prisma.entityNode.create({
      data: {
        userId,
        type: params.type ?? 'PERSON',
        canonicalName: params.name,
        confidence: params.confidence ?? 0.8,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
    if (params.aliases?.length) {
      for (const alias of params.aliases) {
        await prisma.entityAlias.create({ data: { entityId: entity.id, alias } });
      }
    }
    return { success: true, data: entity, source: 'knowledge_graph', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  entity_update: async (userId: string, params: any) => {
    if (params.relationship) {
      // Cross-tenant ownership checks
      const from = await prisma.entityNode.findFirst({ where: { id: params.fromId, userId } });
      if (!from) return { success: false, error: 'Entity not found', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
      const to = await prisma.entityNode.findFirst({ where: { id: params.relationship.toId, userId } });
      if (!to) return { success: false, error: 'Entity not found', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };

      // Supersede old relationship if exists
      if (params.supersede) {
        const old = await prisma.entityEdge.findFirst({
          where: {
            fromId: params.fromId,
            from: { userId },
            relationshipType: params.relationship.type,
            supersededBy: null,
          },
        });
        if (old) {
          const newEdge = await prisma.entityEdge.create({
            data: {
              fromId: params.fromId,
              toId: params.relationship.toId,
              relationshipType: params.relationship.type,
              context: params.relationship.context,
              confidence: params.relationship.confidence ?? 0.8,
              projectId: params.projectId,
            },
          });
          await prisma.entityEdge.update({ where: { id: old.id }, data: { supersededBy: newEdge.id } });
          return { success: true, data: { superseded: old.id, created: newEdge.id }, source: 'knowledge_graph', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
        }
      }
      const edge = await prisma.entityEdge.create({
        data: {
          fromId: params.fromId,
          toId: params.relationship.toId,
          relationshipType: params.relationship.type,
          context: params.relationship.context,
          projectId: params.projectId,
        },
      });
      return { success: true, data: edge, source: 'knowledge_graph', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    }
    return { success: false, error: 'No operation specified', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  web_search: async (_userId: string, params: any) => {
    const query = String(params.query ?? '').trim();
    if (!query) return { success: false, error: 'query required', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };

    const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
    if (braveKey) {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${params.count ?? 5}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': braveKey } });
      if (!res.ok) return { success: false, error: `Brave Search ${res.status}`, timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
      const json: any = await res.json();
      const results = (json.web?.results ?? []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.description }));
      return { success: true, data: results, source: 'brave_search', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    }

    // DuckDuckGo instant-answer fallback (no key required)
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl, { headers: { 'User-Agent': 'WHINK/1.0' } });
    if (!res.ok) return { success: false, error: `DDG ${res.status}`, timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    const json: any = await res.json();
    const results: any[] = [];
    if (json.AbstractText) results.push({ title: json.Heading, url: json.AbstractURL, snippet: json.AbstractText });
    (json.RelatedTopics ?? []).slice(0, 4).forEach((t: any) => {
      if (t.Text && t.FirstURL) results.push({ title: t.Text.split(' - ')[0], url: t.FirstURL, snippet: t.Text });
    });
    return { success: true, data: results, source: 'duckduckgo', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  web_fetch: async (_userId: string, params: any) => {
    const url = String(params.url ?? '').trim();
    if (!url) return { success: false, error: 'url is required', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    try {
      await assertSafeUrl(url);
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'URL rejected', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    }
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'WHINK/1.0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Fetch failed', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    }
    // Reject redirects entirely
    if (res.status >= 300 && res.status < 400) {
      return { success: false, error: `Redirect rejected (${res.status}) — follow the redirect destination manually`, timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    }
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    // Cap body at 100 KB
    const raw = await res.text();
    const capped = raw.substring(0, MAX_WEB_FETCH_BYTES);
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('json')) {
      try {
        return { success: true, data: JSON.parse(capped), source: url, timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
      } catch {
        return { success: true, data: capped, source: url, timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
      }
    }
    // Strip HTML tags for readability
    const plain = capped
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return { success: true, data: plain, source: url, timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  calendar_list: async (userId: string, params: any) => {
    const days = Math.min(params.days ?? 7, 30);
    const now = new Date();
    const end = new Date(now.getTime() + days * 86_400_000);
    const events = await prisma.calendarEvent.findMany({
      where: { userId, startAt: { gte: now, lte: end } },
      orderBy: { startAt: 'asc' },
      take: 20,
    });
    return { success: true, data: events, source: 'calendar', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  calendar_create: async (userId: string, params: any) => {
    const event = await prisma.calendarEvent.create({
      data: {
        userId,
        title: params.title,
        description: params.description,
        startAt: new Date(params.startAt),
        endAt: new Date(params.endAt ?? params.startAt),
        location: params.location,
        allDay: params.allDay ?? false,
      },
    });
    return { success: true, data: event, source: 'calendar', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  note_write: async (userId: string, params: any) => {
    const note = await prisma.note.create({
      data: {
        userId,
        title: params.title ?? 'Untitled',
        content: params.content,
        tags: params.tags ? JSON.stringify(params.tags) : null,
      },
    });
    return { success: true, data: note, source: 'notes', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },

  task_create: async (userId: string, params: any) => {
    // Cross-tenant ownership check: verify project belongs to caller
    const project = await prisma.project.findFirst({ where: { id: params.projectId, userId } });
    if (!project) return { success: false, error: 'Project not found', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
    const task = await prisma.projectTask.create({
      data: {
        projectId: params.projectId,
        title: params.title,
        description: params.description,
        priority: params.priority ?? 'MEDIUM',
        assignee: params.assignee,
        dueDate: params.dueDate ? new Date(params.dueDate) : null,
        source: 'whink',
      },
    });
    return { success: true, data: task, source: 'project_tasks', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  },
});

const TOOL_RISK_MAP: Record<string, PermissionClass> = Object.assign(Object.create(null), {
  memory_write: 'A',
  memory_read: 'A',
  memory_correct: 'B',
  entity_create: 'A',
  entity_update: 'B',
  task_create: 'B',
  web_search: 'A',
  web_fetch: 'B',   // H4: promoted from A to B
  calendar_list: 'A',
  calendar_create: 'B',
  note_write: 'A',
} as Record<string, PermissionClass>);

/**
 * Register every tool currently advertised by the OpenClaw gateway into the
 * in-process TOOL_HANDLERS and TOOL_RISK_MAP registries.
 *
 * Call this once at startup or whenever the tool set may have changed.
 * It is intentionally NOT called on module import — the caller decides when
 * OpenClaw is available. If OpenClaw is unreachable this function logs a
 * warning and returns without throwing, so the rest of the app keeps running.
 *
 * All registered handlers treat OpenClaw responses as untrusted external
 * content (they return the raw payload; callers must use wrapUntrustedContent
 * before splicing results into model context).
 */
const OPENCLAW_NAME_RE = /^[a-z0-9_]{1,64}$/;

export async function registerOpenClawTools(userId: string): Promise<void> {
  let tools;
  try {
    tools = await listOpenClawTools();
  } catch (err: any) {
    console.warn(`[openclaw] tool registration skipped — gateway unreachable: ${err?.message}`);
    return;
  }

  let registered = 0;
  for (const tool of tools) {
    // Validate bare name before prefixing
    if (!tool.name || !OPENCLAW_NAME_RE.test(tool.name)) {
      console.warn(`[openclaw] skipping tool with invalid name: ${JSON.stringify(tool.name)}`);
      continue;
    }

    const prefixedName = `openclaw__${tool.name}`;

    // Never overwrite a built-in handler
    if (prefixedName in TOOL_HANDLERS) {
      console.warn(`[openclaw] skipping ${prefixedName} — would overwrite a built-in tool`);
      continue;
    }

    const capturedName = tool.name;

    // Register handler — wraps callOpenClawTool in the standard result shape.
    TOOL_HANDLERS[prefixedName] = async (_uid: string, params: any): Promise<ToolExecutionResult> => {
      const data = await callOpenClawTool(capturedName, params);
      return {
        success: true,
        data,
        source: 'openclaw',
        timestamp: new Date().toISOString(),
        toolVersion: '1.0.0',
      };
    };

    // Default all OpenClaw tools to Class C unless explicitly configured otherwise.
    // Only an explicit local config allowlist may promote a tool to A or B.
    if (!(prefixedName in TOOL_RISK_MAP)) {
      TOOL_RISK_MAP[prefixedName] = 'C';
    }

    registered++;
  }

  console.log(`[openclaw] registered ${registered} tool(s) for user ${userId}`);
}

export async function executeTool(
  userId: string,
  toolName: string,
  params: any,
  persona?: string,
  mambaMode?: string,
  correlationId?: string
): Promise<ToolExecutionResult> {
  const cid = correlationId ?? generateCorrelationId();
  const startTime = Date.now();

  // Check permission
  const riskClass = TOOL_RISK_MAP[toolName] ?? 'B';
  const permCheck = await checkPermission(userId, toolName, riskClass, cid);

  if (!permCheck.allowed) {
    // Log to action ledger — Class C gets AWAITING_APPROVAL, others get FAILED
    await prisma.action.create({
      data: {
        userId,
        initiator: 'system',
        persona,
        mambaMode,
        tool: toolName,
        action: `tool_execution_denied`,
        permissionClass: riskClass,
        status: riskClass === 'C' ? 'AWAITING_APPROVAL' : 'FAILED',
        inputSummary: JSON.stringify(params).substring(0, 500),
        outputSummary: permCheck.reason,
        correlationId: cid,
        latencyMs: Date.now() - startTime,
      },
    });
    return { success: false, error: permCheck.reason ?? 'Permission denied', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  }

  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return { success: false, error: `Unknown tool: ${toolName}`, timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  }

  try {
    const result = await handler(userId, params);
    // Log to action ledger
    await prisma.action.create({
      data: {
        userId,
        initiator: 'system',
        persona,
        mambaMode,
        tool: toolName,
        action: `tool_executed: ${toolName}`,
        permissionClass: riskClass,
        confirmationMethod: permCheck.method,
        status: result.success ? 'VALIDATED' : 'FAILED',
        inputSummary: JSON.stringify(params).substring(0, 500),
        outputSummary: JSON.stringify(result.data ?? result.error).substring(0, 500),
        correlationId: cid,
        latencyMs: Date.now() - startTime,
      },
    });
    return result;
  } catch (error: any) {
    await prisma.action.create({
      data: {
        userId,
        initiator: 'system',
        persona,
        mambaMode,
        tool: toolName,
        action: `tool_execution_error: ${toolName}`,
        permissionClass: riskClass,
        status: 'FAILED',
        inputSummary: JSON.stringify(params).substring(0, 500),
        outputSummary: error?.message ?? 'Unknown error',
        correlationId: cid,
        latencyMs: Date.now() - startTime,
      },
    });
    return { success: false, error: error?.message ?? 'Tool execution failed', timestamp: new Date().toISOString(), toolVersion: '1.0.0' };
  }
}
