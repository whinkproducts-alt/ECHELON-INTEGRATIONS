// Single source of truth for navigation, the command palette and the manifest shortcuts.
// To add a screen: append one NavItem here and create app/dashboard/<route>/page.tsx. Nothing else.
import type { LucideIcon } from 'lucide-react';
import {
  Command, Sun, MessageSquare, Orbit, Brain, FileText, Newspaper, Network, Users, BookUser, Building2, Contact,
  FolderKanban, CheckSquare, Bot, Plug, Gauge, ShieldAlert, Settings, Link2, CreditCard,
  ClipboardCheck, ScrollText, Activity, Video,
  FileSignature, Landmark, GitPullRequest,
} from 'lucide-react';

import { BookOpenCheck, Waypoints, Moon } from 'lucide-react';
import { getSubsidiaryList } from '@/components/subsidiaries/subsidiary-map';

// Subsidiary names come from config so the palette finds the hub by each name, with no names hardcoded here.
const SUBSIDIARY_KEYWORDS = ['projects', 'portfolio', ...getSubsidiaryList().flatMap((s) => [s.id, s.id.replace(/-/g, ' '), s.name.toLowerCase()])];

export type NavGroupId = 'command' | 'intelligence' | 'people' | 'operations' | 'security' | 'settings';

export interface NavGroup {
  id: NavGroupId;
  label: string;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: NavGroupId;
  /** One line shown in the command palette. */
  description: string;
  /** Extra words the command palette matches on. */
  keywords?: string[];
  /** 'soon' = placeholder page exists, feature not built yet. */
  status: 'live' | 'soon';
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'command', label: 'Command' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'people', label: 'People' },
  { id: 'operations', label: 'Operations' },
  { id: 'security', label: 'Security' },
  { id: 'settings', label: 'Settings' },
];

export const NAV_ITEMS: NavItem[] = [
  { id: 'command', label: 'Command', href: '/dashboard', icon: Command, group: 'command', description: 'Command surface and overview', keywords: ['home', 'dashboard'], status: 'live' },
  { id: 'today', label: 'Today', href: '/dashboard/today', icon: Sun, group: 'command', description: 'The day at a glance', keywords: ['agenda', 'brief', 'schedule'], status: 'live' },
  { id: 'conversation', label: 'Conversation', href: '/dashboard/conversation', icon: MessageSquare, group: 'command', description: 'Talk to your chief of staff', keywords: ['chat', 'talk'], status: 'live' },
  { id: 'holo', label: 'Holo', href: '/dashboard/holo', icon: Orbit, group: 'command', description: 'Holographic presence', keywords: ['presence', 'avatar', 'voice'], status: 'live' },

  { id: 'memory', label: 'Memory', href: '/dashboard/memory', icon: Brain, group: 'intelligence', description: 'What it remembers, with sources', keywords: ['recall', 'facts'], status: 'live' },
  { id: 'documents', label: 'Documents', href: '/dashboard/documents', icon: FileText, group: 'intelligence', description: 'Uploaded documents and citations', keywords: ['files', 'upload', 'pdf'], status: 'live' },
  { id: 'news', label: 'Intelligence feed', href: '/dashboard/holo/news', icon: Newspaper, group: 'intelligence', description: 'News and market signals', keywords: ['news', 'feed'], status: 'live' },
  { id: 'anatomy', label: 'Anatomy', href: '/dashboard/anatomy', icon: Network, group: 'intelligence', description: 'How the system is wired', keywords: ['architecture', 'map', 'kernel'], status: 'live' },

  { id: 'board', label: 'Board', href: '/dashboard/board', icon: Users, group: 'people', description: 'Board members and advisers', keywords: ['advisers', 'directors'], status: 'live' },
  { id: 'directory', label: 'Directory', href: '/dashboard/directory', icon: BookUser, group: 'people', description: 'Staff and agent directory', keywords: ['staff', 'email', 'team'], status: 'live' },
  { id: 'contacts', label: 'Contacts', href: '/dashboard/contacts', icon: Contact, group: 'people', description: 'People you deal with', keywords: ['crm', 'people'], status: 'live' },
  { id: 'companies', label: 'Companies', href: '/dashboard/companies', icon: Building2, group: 'people', description: 'The group and its companies', keywords: ['group', 'apps', 'subsidiary'], status: 'live' },

  { id: 'projects', label: 'Projects', href: '/dashboard/projects', icon: FolderKanban, group: 'operations', description: 'Projects and their status', keywords: ['work'], status: 'live' },
  { id: 'subsidiaries', label: 'Subsidiaries', href: '/dashboard/subsidiaries', icon: Building2, group: 'operations', description: 'The five subsidiaries and their projects', keywords: SUBSIDIARY_KEYWORDS, status: 'live' },
  { id: 'tasks', label: 'Tasks', href: '/dashboard/tasks', icon: CheckSquare, group: 'operations', description: 'Task board', keywords: ['todo'], status: 'live' },
  { id: 'workforce', label: 'Workforce', href: '/dashboard/workforce', icon: Bot, group: 'operations', description: 'Agents and what they are doing', keywords: ['agents', 'staff'], status: 'live' },
  { id: 'kill-team', label: 'Kill Team', href: '/dashboard/kill-team', icon: ShieldAlert, group: 'operations', description: 'Founder-controlled specialist team', keywords: ['peter', 'paul', 'micah', 'nandi', 'michael carrick', 'scout', 'research'], status: 'live' },
  { id: 'connectors', label: 'Connectors', href: '/dashboard/connectors', icon: Plug, group: 'operations', description: 'Connected tools and gateways', keywords: ['mcp', 'integrations', 'gateway'], status: 'live' },
  { id: 'usage', label: 'Usage', href: '/dashboard/usage', icon: Gauge, group: 'operations', description: 'Model usage and limits', keywords: ['cost', 'tokens', 'limits'], status: 'live' },
  { id: 'contracts', label: 'Contracts', href: '/dashboard/contracts', icon: FileSignature, group: 'operations', description: 'Agreements you hold, with renewals', keywords: ['agreements', 'renewals', 'counterparty', 'legal'], status: 'live' },
  { id: 'finance', label: 'Finance', href: '/dashboard/finance', icon: Landmark, group: 'operations', description: 'Contract value, upcoming dates and model spend (read only)', keywords: ['money', 'spend', 'budget', 'revenue', 'currency'], status: 'live' },
  { id: 'change-requests', label: 'Change requests', href: '/dashboard/change-requests', icon: GitPullRequest, group: 'operations', description: 'Ask for product changes, approve what is sent', keywords: ['feature', 'pull request', 'github', 'issue', 'build'], status: 'live' },

  { id: 'security', label: 'Security', href: '/dashboard/security', icon: ShieldAlert, group: 'security', description: 'Security events, approvals and the ledger', keywords: ['ledger', 'approvals', 'audit'], status: 'live' },

  { id: 'settings', label: 'Settings', href: '/dashboard/settings', icon: Settings, group: 'settings', description: 'Preferences and profile', keywords: ['preferences', 'install', 'app'], status: 'live' },
  { id: 'connected-apps', label: 'Connected apps', href: '/dashboard/settings/connected-apps', icon: Link2, group: 'settings', description: 'Social platform connections', keywords: ['social', 'x', 'instagram', 'tiktok'], status: 'live' },
  { id: 'billing', label: 'Billing', href: '/dashboard/settings/billing', icon: CreditCard, group: 'settings', description: 'Plan and billing', keywords: ['plan', 'invoice'], status: 'live' },
  { id: 'approvals', label: 'Approvals', href: '/dashboard/approvals', icon: ClipboardCheck, group: 'security', description: 'Requests waiting for your yes, and their history', keywords: ['approve', 'deny', 'pending', 'protected', 'money', 'history'], status: 'live' },
  { id: 'ledger', label: 'Ledger', href: '/dashboard/ledger', icon: ScrollText, group: 'security', description: 'Search every action that ran, waited or was denied', keywords: ['audit', 'log', 'actions', 'correlation', 'security events'], status: 'live' },
  { id: 'system', label: 'System health', href: '/dashboard/system', icon: Activity, group: 'operations', description: 'Status of the database, models, gateway and worker', keywords: ['status', 'health', 'uptime', 'ollama', 'gateway', 'migrations'], status: 'live' },
  { id: 'meeting', label: 'Meeting room', href: '/dashboard/meeting', icon: Video, group: 'people', description: 'Start a private video meeting with the board', keywords: ['video', 'jitsi', 'call', 'board'], status: 'live' },
  { id: 'skills', label: 'Skill library', href: '/dashboard/skills', icon: BookOpenCheck, group: 'intelligence', description: 'Upload skills, scanned and reviewed before they reach memory', keywords: ['skills', 'upload', 'knowledge', 'pipeline', 'scan', 'committee'], status: 'live' },
  { id: 'swarm', label: 'Swarm control', href: '/dashboard/swarm', icon: Waypoints, group: 'operations', description: 'Plan and run a swarm of agents on one initiative', keywords: ['swarm', 'agents', 'initiative', 'parallel', 'lanes'], status: 'live' },
  { id: 'roster', label: 'Standing roster', href: '/dashboard/roster', icon: Moon, group: 'operations', description: 'The always-on organisation and its background worker', keywords: ['roster', 'worker', 'heartbeat', 'jobs', 'always on', 'schedule'], status: 'live' },
];

/** Longest matching href wins, so /dashboard/holo/news highlights Intelligence feed, not Holo. */
export function activeNavId(pathname: string | null): string | null {
  if (!pathname) return null;
  let best: NavItem | null = null;
  for (const item of NAV_ITEMS) {
    const hit = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.id ?? null;
}

export function navByGroup(): { group: NavGroup; items: NavItem[] }[] {
  return NAV_GROUPS.map((group) => ({ group, items: NAV_ITEMS.filter((i) => i.group === group.id) }));
}

/** Routes the manifest exposes as app shortcuts. Names resolve through NAV_ITEMS labels. */
export const SHORTCUT_IDS = ['today', 'board', 'command'] as const;
