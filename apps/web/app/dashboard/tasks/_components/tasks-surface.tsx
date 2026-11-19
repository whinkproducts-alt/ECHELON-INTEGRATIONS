'use client';

import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDashboardDataClient } from '@/components/shell/dashboard-data-provider';
import { DASHBOARD_KEYS } from '@/lib/dashboard-query-cache';
import { dashboardJson } from '@/lib/dashboard-client';
import { CheckSquare, Circle, CheckCircle2, Clock } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee: string | null;
  dueDate: string | null;
  project?: { name: string };
  updatedAt: string;
}

export function TasksSurface() {
  const client = useDashboardDataClient();
  const { data: tasks = [], isPending: loading, error, refetch, isFetching } = useQuery({
    queryKey: DASHBOARD_KEYS.tasks,
    queryFn: async ({ signal }) => {
      const data = await dashboardJson<Task[]>('/api/tasks', { signal });
      if (!Array.isArray(data)) throw new Error('Unexpected service response.');
      return data;
    },
  }, client);
  const [filter, setFilter] = useState('ALL');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const toggleStatus = async (task: Task) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    setMutationError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error('Task update could not be confirmed. Refresh before trying again.');
      client.setQueryData<Task[]>(DASHBOARD_KEYS.tasks, prev => (prev ?? []).map((t: Task) => t.id === task.id ? { ...t, status: newStatus } : t));
      void client.invalidateQueries({ queryKey: DASHBOARD_KEYS.tasks });
      void client.invalidateQueries({ queryKey: DASHBOARD_KEYS.projects });
      void client.invalidateQueries({ queryKey: DASHBOARD_KEYS.projectDetails });
    } catch { setMutationError('Task update could not be confirmed. Refresh before trying again.'); }
  };

  const filtered = filter === 'ALL' ? tasks : (tasks ?? []).filter((t: Task) => t.status === filter);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader title="Tasks" description="All tasks across projects" />

      <div className="flex gap-2">
        {['ALL', 'TODO', 'IN_PROGRESS', 'DONE'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-md font-mono transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {(error || mutationError) && <ErrorState message={`${mutationError ?? error?.message}${tasks.length > 0 ? ' Showing last known tasks.' : ''}`} onRetry={isFetching ? undefined : () => void refetch()} />}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
      ) : (filtered ?? []).length === 0 ? (
        <EmptyState icon={<CheckSquare />} title="No tasks found" description="Tasks appear here when you or WHINK add them to a project, or change the filter above." />
      ) : (
        <div className="space-y-2">
          {(filtered ?? []).map((task: Task) => (
            <div key={task.id} className="bg-card rounded-lg border border-border p-4 flex items-center gap-4 hover:border-primary/20 transition-colors">
              <button onClick={() => toggleStatus(task)} className="flex-shrink-0">
                {task.status === 'DONE' ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${task.status === 'DONE' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.title}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground">{task.project?.name ?? 'No project'}</span>
                  {task.dueDate && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /><SafeDate date={task.dueDate} options={{ dateStyle: 'short' }} /></span>}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                task.priority === 'HIGH' || task.priority === 'URGENT' ? 'bg-destructive/10 text-destructive' :
                task.priority === 'MEDIUM' ? 'bg-muted/50 text-muted-foreground' :
                'bg-secondary text-muted-foreground'
              }`}>{task.priority}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
