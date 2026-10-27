'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CheckCircle2, Clock, FolderKanban,
  MessageSquare, Brain, Activity, ArrowRight, Plus
} from 'lucide-react';
import { SafeDate } from '@/components/safe-format';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { SubsidiaryChip } from '@/components/subsidiaries/subsidiary-chip';
import { getSubsidiaryList, projectReportHref } from '@/components/subsidiaries/subsidiary-map';

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  openTaskCount: number;
  updatedAt: string;
  subsidiary?: string | null;
  progress?: { tasksTotal: number; tasksDone: number; percent: number };
  nextMilestone?: { title: string; dueDate: string | null } | null;
  openRisks?: number;
  openQuestions?: number;
}

/** Tolerates the API returning either a bare id or an object with an id. */
function subsidiaryIdOf(p: ProjectSummary): string | null {
  const s = p?.subsidiary as unknown;
  if (!s) return null;
  return typeof s === 'string' ? s : ((s as { id?: string }).id ?? null);
}

interface TaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  project?: { name: string };
  dueDate: string | null;
}

interface ActionSummary {
  id: string;
  action: string;
  persona: string | null;
  status: string;
  createdAt: string;
}

export function CommandSurface() {
  const router = useRouter();
  const { productName } = useTenantConfig();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [actions, setActions] = useState<ActionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then((r) => r.json()).catch(() => []),
      fetch('/api/tasks').then((r) => r.json()).catch(() => []),
      fetch('/api/ledger?limit=10').then((r) => r.json()).catch(() => []),
    ]).then(([p, t, a]) => {
      setProjects(Array.isArray(p) ? p : []);
      setTasks(Array.isArray(t) ? t : []);
      setActions(Array.isArray(a) ? a : []);
      setLoading(false);
    });
  }, []);

  // Subsidiary counts are a nicety: any failure leaves the tiles without numbers.
  useEffect(() => {
    fetch('/api/subsidiaries')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: unknown = Array.isArray(d) ? d : d?.subsidiaries;
        if (!Array.isArray(list)) return;
        const next: Record<string, number> = {};
        for (const row of list as Array<{ id?: string; counts?: { active?: number }; activeProjects?: number }>) {
          const n = row?.counts?.active ?? row?.activeProjects;
          if (row?.id && typeof n === 'number') next[row.id] = n;
        }
        setCounts(next);
      })
      .catch(() => {});
  }, []);

  const openTasks = (tasks ?? []).filter((t: TaskSummary) => t?.status !== 'DONE');
  const highPriority = openTasks.filter((t: TaskSummary) => t?.priority === 'HIGH' || t?.priority === 'URGENT');
  const activeProjects = (projects ?? []).filter((p: ProjectSummary) => p?.status === 'ACTIVE');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">What requires your attention</h1>
        <p className="text-sm text-muted-foreground mt-1">{`${productName} command overview`}</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard icon={<FolderKanban className="h-5 w-5" />} label="Active Projects" value={activeProjects.length} color="primary" />
        <StatusCard icon={<CheckCircle2 className="h-5 w-5" />} label="Open Tasks" value={openTasks.length} color="blue" />
        <StatusCard icon={<AlertTriangle className="h-5 w-5" />} label="High Priority" value={highPriority.length} color="amber" />
        <StatusCard icon={<Activity className="h-5 w-5" />} label="Recent Actions" value={(actions ?? []).length} color="purple" />
      </div>

      {/* Subsidiaries strip */}
      <nav aria-label="Subsidiaries" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {getSubsidiaryList().map((sub) => (
          <Link
            key={sub.id}
            href={`/dashboard/subsidiaries/${sub.id}`}
            className="bg-card rounded-lg border border-border p-3 flex items-center gap-3 hover:border-primary/40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Image src={sub.logo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-md object-cover" />
            <span className="min-w-0">
              <span className="block text-sm text-foreground truncate">{sub.name}</span>
              {typeof counts[sub.id] === 'number' && (
                <span className="block text-xs text-muted-foreground font-mono">{counts[sub.id]} active</span>
              )}
            </span>
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Priority Tasks */}
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" /> Priority Items
            </h2>
            <button
              onClick={() => router.push('/dashboard/tasks')}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-secondary animate-pulse rounded" />)}</div>
          ) : openTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No open tasks. Clear board.</p>
          ) : (
            <div className="space-y-2">
              {openTasks.slice(0, 5).map((task: TaskSummary) => (
                <div key={task?.id} className="flex items-center justify-between py-2 px-3 bg-secondary/50 rounded-md hover:bg-secondary transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{task?.title ?? 'Untitled'}</p>
                    <p className="text-xs text-muted-foreground">{task?.project?.name ?? 'No project'}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                    task?.priority === 'HIGH' || task?.priority === 'URGENT'
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-primary/10 text-primary'
                  }`}>{task?.priority ?? 'MEDIUM'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Projects */}
        <div className="bg-card rounded-lg border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-muted-foreground" /> Projects
            </h2>
            <button
              onClick={() => router.push('/dashboard/projects')}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-secondary animate-pulse rounded" />)}</div>
          ) : activeProjects.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">No projects yet.</p>
              <button
                onClick={() => router.push('/dashboard/projects')}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:opacity-90"
              >
                <Plus className="h-3 w-3" /> Create Project
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {activeProjects.slice(0, 5).map((p: ProjectSummary) => {
                const sid = subsidiaryIdOf(p);
                const pr = p?.progress;
                const pct = Math.max(0, Math.min(100, pr?.percent ?? 0));
                return (
                  <li key={p?.id}>
                    <Link
                      href={projectReportHref(p?.id, sid)}
                      className="block py-2.5 px-3 bg-secondary/50 rounded-md hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground truncate">{p?.name ?? 'Untitled'}</span>
                        <span className="text-[0.6875rem] text-muted-foreground font-mono shrink-0">{p?.status}</span>
                      </span>
                      <span className="mt-1.5 flex"><SubsidiaryChip id={sid} /></span>
                      {pr ? (
                        <span className="mt-2 flex items-center gap-2">
                          <span className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${p?.name} progress`}>
                            <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="text-xs font-mono text-foreground">{pct}%</span>
                          <span className="text-xs font-mono text-muted-foreground">{pr.tasksDone}/{pr.tasksTotal} tasks</span>
                        </span>
                      ) : (
                        <span className="mt-2 block text-xs font-mono text-muted-foreground">{p?.openTaskCount ?? 0} tasks</span>
                      )}
                      <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">
                          {p?.nextMilestone
                            ? <>Next: {p.nextMilestone.title}{p.nextMilestone.dueDate && <> · <SafeDate date={p.nextMilestone.dueDate} options={{ dateStyle: 'medium' }} /></>}</>
                            : 'No upcoming milestone'}
                        </span>
                        <span className="font-mono shrink-0">{p?.openRisks ?? 0} {(p?.openRisks ?? 0) === 1 ? 'risk' : 'risks'} · {p?.openQuestions ?? 0} {(p?.openQuestions ?? 0) === 1 ? 'question' : 'questions'}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card rounded-lg border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" /> Recent Activity
          </h2>
        </div>
        {(actions ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet. Start a conversation.</p>
        ) : (
          <div className="space-y-1">
            {(actions ?? []).slice(0, 8).map((a: ActionSummary) => (
              <div key={a?.id} className="flex items-center gap-3 py-1.5 text-xs">
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                  a?.status === 'VALIDATED' ? 'bg-primary' : a?.status === 'FAILED' ? 'bg-destructive' : 'bg-muted-foreground'
                }`} />
                <span className="text-muted-foreground truncate flex-1 font-mono">{a?.action ?? 'Unknown'}</span>
                <span className="text-muted-foreground/60"><SafeDate date={a?.createdAt} options={{ dateStyle: 'short', timeStyle: 'short' }} /></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => router.push('/dashboard/conversation')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <MessageSquare className="h-4 w-4" /> New Conversation
        </button>
        <button
          onClick={() => router.push('/dashboard/memory')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-accent transition-colors"
        >
          <Brain className="h-4 w-4" /> Browse Memory
        </button>
      </div>
    </div>
  );
}

function StatusCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    primary: 'text-primary bg-primary/10',
    blue: 'text-[hsl(var(--whink-accent))] bg-[hsl(var(--whink-accent))]/10',
    amber: 'text-muted-foreground bg-muted/50',
    purple: 'text-muted-foreground bg-muted/50',
  };
  const cls = colorMap[color] ?? colorMap.primary;
  return (
    <div className="bg-card rounded-lg border border-border p-4 flex items-center gap-4">
      <div className={`p-2 rounded-lg ${cls}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
