import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { PresenceSurface } from '@/components/holo/presence-surface';

export default async function PresencePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <PresenceSurface />;
}
