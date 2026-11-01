import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ConnectedAppsSurface } from './_components/connected-apps-surface';
import { noticeFromQuery } from '@/lib/social-ui';

type Search = Promise<{ connected?: string | string[]; error?: string | string[] }>;

function first(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s.slice(0, 64) : null;
}

export default async function ConnectedAppsPage({ searchParams }: { searchParams: Search }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const sp = await searchParams;
  // Mapped to fixed, plain-text strings server-side; raw query text is never passed on.
  const notice = noticeFromQuery(first(sp.connected), first(sp.error));
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <ConnectedAppsSurface initialNotice={notice} />
    </div>
  );
}
