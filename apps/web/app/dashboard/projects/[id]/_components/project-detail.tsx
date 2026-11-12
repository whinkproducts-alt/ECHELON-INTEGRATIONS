'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDashboardDataClient } from '@/components/shell/dashboard-data-provider';
import { DASHBOARD_KEYS } from '@/lib/dashboard-query-cache';
import { dashboardJson } from '@/lib/dashboard-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Target, CheckSquare, AlertTriangle, HelpCircle,
  Milestone, Plus, ArrowRight
} from 'lucide-react';
import { SubsidiaryChip } from '@/components/subsidiaries/subsidiary-chip';
import { getSubsidiaryList, projectReportHref } from '@/components/subsidiaries/subsidiary-map';


export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const client = useDashboardDataClient();
  const projectKey = [...DASHBOARD_KEYS.projectDetails, projectId];
  const { data: project, isPending: loading, error, refetch } = useQuery({
    queryKey: projectKey,
    queryFn: ({ signal }) => dashboardJson<any>(`/api/projects/${encodeURIComponent(projectId)}`, { signal }),
  }, client);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [subError, setSubError] = useState<string | null>(null);
  const [subSaving, setSubSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const assignSubsidiary = async (value: string) => {
    setSubSaving(true);
    setSubError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subsidiary: value || null }),
      });
      if (!res.ok) throw new Error('failed');
      client.setQueryData(projectKey, (prev: any) => ({ ...prev, subsidiary: value || null }));
      void client.invalidateQueries({ queryKey: DASHBOARD_KEYS.projects });
      void client.invalidateQueries({ queryKey: projectKey });
    } catch {
      setSubError('Could not update the subsidiary.');
    } finally {
      setSubSaving(false);
    }
  };

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    setTaskError(null);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, title: newTaskTitle }),
      });
      if (!response.ok) throw new Error('Task creation could not be confirmed.');
      setNewTaskTitle('');
      await Promise.all([
        client.invalidateQueries({ queryKey: projectKey }),
        client.invalidateQueries({ queryKey: DASHBOARD_KEYS.projects }),
        client.invalidateQueries({ queryKey: DASHBOARD_KEYS.tasks }),
      ]);
    } catch { setTaskError('Task creation could not be confirmed. Refresh before trying again.'); }
  };

  if (loading) return <div className="p-6"><div className="h-40 bg-card animate-pulse rounded-lg" /></div>;
  if (!project) return <div className="p-6 text-muted-foreground" role="alert">{error?.message ?? 'Project not found.'} <button className="underline" onClick={() => void refetch()}>Retry</button></div>;

  const rawSub = project?.subsidiary;
  const subsidiaryId: string | null = typeof rawSub === 'string' ? rawSub : (rawSub?.id ?? null);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {(error || taskError) && <p role="alert" className="text-sm text-destructive">{taskError ?? error?.message} <button onClick={() => void refetch()} className="underline">Refresh</button></p>}
      <button onClick={() => router.push('/dashboard/projects')} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </button>

      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{project?.name ?? 'Untitled'}</h1>
        {project?.goal && <p className="text-sm text-muted-foreground mt-1"><Target className="inline h-3 w-3 mr-1" />{project.goal}</p>}
        {project?.description && <p className="text-sm text-muted-foreground mt-2">{project.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SubsidiaryChip id={subsidiaryId} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Subsidiary
            <select
              value={subsidiaryId ?? ''}
              disabled={subSaving}
              onChange={(e) => assignSubsidiary(e.target.value)}
              className="px-2 py-1 bg-secondary rounded-md border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Unassigned</option>
              {getSubsidiaryList().map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {subsidiaryId && (
            <Link href={projectReportHref(projectId, subsidiaryId)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              Full report <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {subError && <span role="alert" className="text-xs text-foreground">{subError}</span>}
        </div>
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
                  t.status === 'IN_PROGRESS' ? 'bg-[hsl(var(--whink-accent))]/10 text-[hsl(var(--whink-accent))]' :
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
              <HelpCircle className="h-4 w-4 text-[hsl(var(--whink-accent))]" /> Open Questions
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
