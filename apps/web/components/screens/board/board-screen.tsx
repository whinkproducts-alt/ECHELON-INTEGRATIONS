'use client';
// BoardScreen: Board Room. Members come from the server page (config/board.json). Meetings load client-side from GET /api/board/meetings.
// Quick Meeting copies the pattern in components/holo/holo-surface.tsx (POST /api/meetings/quick-start, opens meetingUrl in a new tab).
import * as React from 'react';
import { Users, Zap } from 'lucide-react';
import { HoloButton, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloTabs } from '@/components/ui/holo';
import type { BoardMember } from '@/lib/board';
import { BoardGallery } from './board-gallery';
import { ConvenePanel, type MeetingsState } from './convene-panel';
import { MeetingRoom } from './meeting-room';
import type { BoardMeetingView } from './types';

export function BoardScreen({ members }: { members: BoardMember[] }) {
  const [state, setState] = React.useState<MeetingsState>({ kind: 'loading' });
  const [reload, setReload] = React.useState(0);
  const [tab, setTab] = React.useState('members');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [quick, setQuick] = React.useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  React.useEffect(() => {
    let live = true;
    fetch('/api/board/meetings')
      .then((r) => { if (!r.ok) throw new Error(r.status === 401 ? 'Sign in again to view meetings.' : 'The meetings service did not respond.'); return r.json() as Promise<{ meetings?: BoardMeetingView[] }>; })
      .then((d) => { if (live) setState({ kind: 'ready', meetings: Array.isArray(d.meetings) ? d.meetings : [] }); })
      .catch((e: unknown) => { if (live) setState({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error.' }); });
    return () => { live = false; };
  }, [reload]);

  const upsert = (m: BoardMeetingView) =>
    setState((s) => (s.kind === 'ready' ? { kind: 'ready', meetings: s.meetings.some((x) => x.id === m.id) ? s.meetings.map((x) => (x.id === m.id ? m : x)) : [m, ...s.meetings] } : s));
  const retry = () => { setState({ kind: 'loading' }); setReload((n) => n + 1); };
  const select = (id: string) => { setSelectedId(id); setTab('room'); };

  const assistant = members.find((m) => m.id === 'marcus-vale');
  const quickStart = () => {
    if (quick.loading || !assistant) return;
    setQuick({ loading: true, error: null });
    fetch('/api/meetings/quick-start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantName: assistant.name, assistantEmail: assistant.email }),
    })
      .then((r) => {
        if (r.status === 404) { setQuick({ loading: false, error: `Meeting room unavailable. Contact ${assistant.email ?? assistant.name}.` }); return; }
        if (!r.ok) { setQuick({ loading: false, error: 'Could not start the meeting. Try again.' }); return; }
        return r.json().then((d: { meetingUrl?: string }) => {
          setQuick({ loading: false, error: null });
          if (d.meetingUrl) window.open(d.meetingUrl, '_blank', 'noopener,noreferrer');
        });
      })
      .catch(() => setQuick({ loading: false, error: `Meeting room unavailable. Contact ${assistant.email ?? assistant.name}.` }));
  };

  const selected = state.kind === 'ready' ? state.meetings.find((m) => m.id === selectedId) ?? null : null;
  const pending = members.filter((m) => m.needsDetails).length;

  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={70} />
      <div className="relative z-10 mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
        <HoloHeading eyebrow="Governance" title="Board Room"
          description={`${members.length} members${pending ? `, ${pending} with details pending` : ''}. Convene a meeting, run the table, keep the minutes.`}
          actions={assistant ? <HoloButton onClick={quickStart} loading={quick.loading} leftIcon={<Zap className="h-4 w-4" aria-hidden />}>Quick Meeting with {assistant.name}</HoloButton> : undefined} />
        {quick.error && <p role="alert" className="text-sm text-[hsl(var(--ember))]"><span className="font-mono text-xs uppercase tracking-wider">Error: </span>{quick.error}</p>}
        <HoloTabs ariaLabel="Board room sections" value={tab} onValueChange={setTab} tabs={[
          { id: 'members', label: 'Members', content: members.length ? <BoardGallery members={members} /> : <HoloEmpty title="No board members configured" description="Add confirmed members to config/board.json." icon={<Users className="h-6 w-6" aria-hidden />} /> },
          { id: 'convene', label: 'Convene', content: <ConvenePanel members={members} state={state} selectedId={selectedId} onSelect={select} onCreated={(m) => { upsert(m); select(m.id); }} onRetry={retry} /> },
          { id: 'room', label: 'Meeting room', content: <MeetingRoom meeting={selected} members={members} onSaved={upsert} /> },
        ]} />
      </div>
    </div>
  );
}
