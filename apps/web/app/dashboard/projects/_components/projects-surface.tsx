'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, Plus, ArrowRight } from 'lucide-react';


interface Project {
  id: string;
  name: string;
  goal: string | null;
  description: string | null;
  status: string;
  openTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export function ProjectsSurface() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(d => { setProjects(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const createProject = async () => {
    if (!newName.trim()) return;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, goal: newGoal || null, description: newDesc || null }),
    });
    const p = await res.json();
    setProjects(prev => [{ ...p, openTaskCount: 0 }, ...(prev ?? [])]);
    setNewName(''); setNewGoal(''); setNewDesc(''); setShowCreate(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage active projects and their context</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90">
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      {showCreate && (
        <div className="bg-card rounded-lg border border-border p-5 space-y-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Project name" className="w-full px-3 py-2 bg-secondary rounded-md border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          <input value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="Goal (optional)" className="w-full px-3 py-2 bg-secondary rounded-md border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full px-3 py-2 bg-secondary rounded-md border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          <div className="flex gap-2">
            <button onClick={createProject} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90">Create</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm hover:bg-accent">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-card animate-pulse rounded-lg" />)}</div>
      ) : (projects ?? []).length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No projects. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {(projects ?? []).map((p: Project) => (
            <button
              key={p.id}
              onClick={() => router.push(`/dashboard/projects/${p.id}`)}
              className="bg-card rounded-lg border border-border p-5 text-left hover:border-primary/30 transition-colors w-full"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FolderKanban className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-medium text-foreground">{p.name}</h3>
                    {p.goal && <p className="text-xs text-muted-foreground mt-0.5">{p.goal}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${p.status === 'ACTIVE' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>{p.status}</span>
                  <span className="text-xs text-muted-foreground font-mono">{p.openTaskCount} open</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
