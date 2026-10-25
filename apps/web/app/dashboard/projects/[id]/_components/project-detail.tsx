'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Target, CheckSquare, AlertTriangle, HelpCircle,
  Milestone, Plus
} from 'lucide-react';


export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(r => r.json())
      .then(d => { setProject(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [projectId]);

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, title: newTaskTitle }),
    });
    setNewTaskTitle('');
    // Reload
    const d = await fetch(`/api/projects/${projectId}`).then(r => r.json());
    setProject(d);
  };

  if (loading) return <div className="p-6"><div className="h-40 bg-card animate-pulse rounded-lg" /></div>;
  if (!project) return <div className="p-6 text-muted-foreground">Project not found.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <button onClick={() => router.push('/dashboard/projects')} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </button>

      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{project?.name ?? 'Untitled'}</h1>
        {project?.goal && <p className="text-sm text-muted-foreground mt-1"><Target className="inline h-3 w-3 mr-1" />{project.goal}</p>}
        {project?.description && <p className="text-sm text-muted-foreground mt-2">{project.description}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks */}
        <div className="bg-card rounded-lg border border-border p-5">
          <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-4">
            <CheckSquare className="h-4 w-4 text-muted-foreground" /> Tasks
          </h2>
          <div className="space-y-2 mb-3">
            {(project?.tasks ?? []).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-2 px-3 bg-secondary/50 rounded-md">
                <span className={`text-sm ${t.status === 'DONE' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{t.title}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                  t.status === 'DONE' ? 'bg-primary/10 text-primary' :
                  t.status === 'IN_PROGRESS' ? 'bg-blue-400/10 text-blue-400' :
                  'bg-secondary text-muted-foreground'
                }`}>{t.status}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Add task..." className="flex-1 px-3 py-2 bg-secondary rounded-md border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={addTask} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90"><Plus className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Risks & Questions */}
        <div className="space-y-4">
          <div className="bg-card rounded-lg border border-border p-5">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" /> Risks
            </h2>
            {(project?.risks ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No risks identified.</p>
            ) : (project.risks ?? []).map((r: any) => (
              <div key={r.id} className="py-1.5 text-sm text-foreground">
                <span className="text-xs text-muted-foreground font-mono mr-2">[{r.severity}]</span>{r.title}
              </div>
            ))}
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
              <HelpCircle className="h-4 w-4 text-blue-400" /> Open Questions
            </h2>
            {(project?.openQuestions ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No open questions.</p>
            ) : (project.openQuestions ?? []).map((q: any) => (
              <div key={q.id} className="py-1.5 text-sm text-foreground">{q.question}</div>
            ))}
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
              <Milestone className="h-4 w-4 text-primary" /> Decisions
            </h2>
            {(project?.decisions ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No decisions recorded.</p>
            ) : (project.decisions ?? []).map((d: any) => (
              <div key={d.id} className="py-1.5">
                <p className="text-sm text-foreground">{d.title}</p>
                {d.rationale && <p className="text-xs text-muted-foreground mt-0.5">{d.rationale}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
