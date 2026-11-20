import { prisma } from '@/lib/db';
import { resolveMarcusOwner } from '@/lib/marcus/freeze';

export const MARCUS_DASHBOARDS = [
  { id: 'overview', title: 'Executive overview', description: 'Projects, tasks, approvals, usage and swarm activity.', path: '/dashboard', mode: 'live' },
  { id: 'projects', title: 'Projects', description: 'Current projects and delivery health.', path: '/dashboard/projects', mode: 'live' },
  { id: 'tasks', title: 'Tasks', description: 'Owner-scoped work across projects.', path: '/dashboard/tasks', mode: 'live' },
  { id: 'approvals', title: 'Approvals', description: 'Pending and recent approval decisions.', path: '/dashboard/approvals', mode: 'live' },
  { id: 'usage', title: 'Model usage', description: 'Recorded model cost and token consumption.', path: '/dashboard/usage', mode: 'live' },
  { id: 'swarms', title: 'Swarms', description: 'Recent multi-agent execution activity.', path: '/dashboard/swarm', mode: 'live' },
  { id: 'today', title: 'Today', description: 'Today view in ECHELON.', path: '/dashboard/today', mode: 'link' },
  { id: 'board', title: 'Board', description: 'Board-level operating view.', path: '/dashboard/board', mode: 'link' },
  { id: 'finance', title: 'Finance', description: 'Financial operations dashboard.', path: '/dashboard/finance', mode: 'link' },
  { id: 'ledger', title: 'Ledger', description: 'Operating ledger and records.', path: '/dashboard/ledger', mode: 'link' },
  { id: 'companies', title: 'Companies', description: 'Company portfolio view.', path: '/dashboard/companies', mode: 'link' },
  { id: 'subsidiaries', title: 'Subsidiaries', description: 'Subsidiary portfolio and operations.', path: '/dashboard/subsidiaries', mode: 'link' },
  { id: 'org', title: 'Organization', description: 'Organization structure and reporting.', path: '/dashboard/org', mode: 'link' },
  { id: 'workforce', title: 'Workforce', description: 'Workforce operations dashboard.', path: '/dashboard/workforce', mode: 'link' },
  { id: 'roster', title: 'Roster', description: 'Team and agent roster.', path: '/dashboard/roster', mode: 'link' },
  { id: 'directory', title: 'Directory', description: 'ECHELON directory.', path: '/dashboard/directory', mode: 'link' },
  { id: 'contacts', title: 'Contacts', description: 'Contact records.', path: '/dashboard/contacts', mode: 'link' },
  { id: 'contracts', title: 'Contracts', description: 'Contract management dashboard.', path: '/dashboard/contracts', mode: 'link' },
  { id: 'change-requests', title: 'Change requests', description: 'Requested changes and decisions.', path: '/dashboard/change-requests', mode: 'link' },
  { id: 'conversation', title: 'Conversation', description: 'Conversation workspace.', path: '/dashboard/conversation', mode: 'link' },
  { id: 'meeting', title: 'Meetings', description: 'Meeting workspace and records.', path: '/dashboard/meeting', mode: 'link' },
  { id: 'documents', title: 'Documents', description: 'Document workspace.', path: '/dashboard/documents', mode: 'link' },
  { id: 'media', title: 'Media', description: 'Media workspace.', path: '/dashboard/media', mode: 'link' },
  { id: 'memory', title: 'Memory', description: 'Memory and retained context.', path: '/dashboard/memory', mode: 'link' },
  { id: 'skills', title: 'Skills', description: 'Available skills and capabilities.', path: '/dashboard/skills', mode: 'link' },
  { id: 'connectors', title: 'Connectors', description: 'Connected systems and tools.', path: '/dashboard/connectors', mode: 'link' },
  { id: 'integrations', title: 'Integrations', description: 'Integration management.', path: '/dashboard/integrations', mode: 'link' },
  { id: 'security', title: 'Security', description: 'Security posture and controls.', path: '/dashboard/security', mode: 'link' },
  { id: 'system', title: 'System', description: 'System status and controls.', path: '/dashboard/system', mode: 'link' },
  { id: 'anatomy', title: 'Anatomy', description: 'ECHELON system anatomy.', path: '/dashboard/anatomy', mode: 'link' },
  { id: 'kill-team', title: 'Kill Team', description: 'Kill Team operations.', path: '/dashboard/kill-team', mode: 'link' },
  { id: 'holo', title: 'Holo', description: 'Holo command workspace.', path: '/dashboard/holo', mode: 'link' },
  { id: 'holo-news', title: 'Holo news', description: 'Holo news view.', path: '/dashboard/holo/news', mode: 'link' },
  { id: 'holo-obsidian', title: 'Holo obsidian', description: 'Holo obsidian view.', path: '/dashboard/holo/obsidian', mode: 'link' },
  { id: 'holo-presence', title: 'Holo presence', description: 'Holo presence view.', path: '/dashboard/holo/presence', mode: 'link' },
  { id: 'settings', title: 'Settings', description: 'ECHELON settings.', path: '/dashboard/settings', mode: 'link' },
  { id: 'billing', title: 'Billing', description: 'Billing settings.', path: '/dashboard/settings/billing', mode: 'link' },
  { id: 'connected-apps', title: 'Connected apps', description: 'Connected app settings.', path: '/dashboard/settings/connected-apps', mode: 'link' },
] as const;

export type MarcusDashboardId = typeof MARCUS_DASHBOARDS[number]['id'];

async function ownerId(): Promise<string> {
  const owner = await resolveMarcusOwner();
  if (!owner) throw new Error('owner_not_configured');
  return owner.id;
}

export async function readMarcusDashboard(id: MarcusDashboardId) {
  const dashboard = MARCUS_DASHBOARDS.find((item) => item.id === id);
  if (!dashboard) throw new Error('dashboard_not_found');
  if (dashboard.mode === 'link') {
    return { id, mode: 'link', path: dashboard.path, message: 'Open this dashboard in ECHELON to view its full data.' };
  }
  const userId = await ownerId();
  if (id === 'projects') {
    const rows = await prisma.project.findMany({
      where: { ownerId: userId }, orderBy: { updatedAt: 'desc' }, take: 50,
      select: { id: true, name: true, goal: true, status: true, subsidiary: true, updatedAt: true, _count: { select: { tasks: true, milestones: true, risks: true } } },
    });
    return { id, rows };
  }
  if (id === 'tasks') {
    const rows = await prisma.projectTask.findMany({
      where: { project: { ownerId: userId } }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, title: true, status: true, priority: true, assignee: true, dueDate: true, updatedAt: true, project: { select: { id: true, name: true } } },
    });
    return { id, rows };
  }
  if (id === 'approvals') {
    const rows = await prisma.approvalRequest.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 75,
      select: { id: true, summary: true, permissionClass: true, status: true, persona: true, createdAt: true, expiresAt: true, decidedAt: true },
    });
    return { id, rows };
  }
  if (id === 'usage') {
    const [totals, recent] = await Promise.all([
      prisma.usageEvent.aggregate({ where: { userId }, _sum: { tokensIn: true, tokensOut: true, costMicros: true } }),
      prisma.usageEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, provider: true, model: true, tokensIn: true, tokensOut: true, costMicros: true, kind: true, createdAt: true } }),
    ]);
    return { id, totals: totals._sum, rows: recent };
  }
  if (id === 'swarms') {
    const rows = await prisma.swarmRun.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, title: true, status: true, agentCount: true, tokensUsed: true, stopReason: true, createdAt: true, updatedAt: true },
    });
    return { id, rows };
  }
  const [projects, taskGroups, pendingApprovals, usage, swarmGroups] = await Promise.all([
    prisma.project.count({ where: { ownerId: userId } }),
    prisma.projectTask.groupBy({ by: ['status'], where: { project: { ownerId: userId } }, _count: { _all: true } }),
    prisma.approvalRequest.count({ where: { userId, status: 'PENDING' } }),
    prisma.usageEvent.aggregate({ where: { userId }, _sum: { tokensIn: true, tokensOut: true, costMicros: true } }),
    prisma.swarmRun.groupBy({ by: ['status'], where: { userId }, _count: { _all: true } }),
  ]);
  return { id, projects, tasks: taskGroups, pendingApprovals, usage: usage._sum, swarms: swarmGroups };
}
