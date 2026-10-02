'use client';

import { useState, useEffect } from 'react';
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/tasks').then(r => r.json()).then(d => { setTasks(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const toggleStatus = async (task: Task) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setTasks(prev => (prev ?? []).map((t: Task) => t.id === task.id ? { ...t, status: newStatus } : t));
  };

  const filtered = filter === 'ALL' ? tasks : (tasks ?? []).filter((t: Task) => t.status === filter);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">All tasks across projects</p>
      </div>

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

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-card animate-pulse rounded" />)}</div>
      ) : (filtered ?? []).length === 0 ? (
        <div className="text-center py-16">
          <CheckSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No tasks found.</p>
        </div>
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
                task.priority === 'MEDIUM' ? 'bg-amber-400/10 text-amber-400' :
                'bg-secondary text-muted-foreground'
              }`}>{task.priority}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
