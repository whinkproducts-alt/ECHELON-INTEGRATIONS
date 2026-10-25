'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CheckCircle2, Clock, FolderKanban,
  MessageSquare, Brain, Activity, ArrowRight, Plus
} from 'lucide-react';
import { SafeDate } from '@/components/safe-format';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  openTaskCount: number;
  updatedAt: string;
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
            <div className="space-y-2">
              {activeProjects.slice(0, 5).map((p: ProjectSummary) => (
                <button
                  key={p?.id}
                  onClick={() => router.push(`/dashboard/projects/${p?.id}`)}
                  className="flex items-center justify-between py-2 px-3 bg-secondary/50 rounded-md hover:bg-secondary transition-colors w-full text-left"
                >
                  <span className="text-sm text-foreground">{p?.name ?? 'Untitled'}</span>
                  <span className="text-xs text-muted-foreground font-mono">{p?.openTaskCount ?? 0} tasks</span>
                </button>
              ))}
            </div>
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
    blue: 'text-blue-400 bg-blue-400/10',
    amber: 'text-muted-foreground bg-muted/50',
    purple: 'text-purple-400 bg-purple-400/10',
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
