import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ObsidianSurface } from '@/components/holo/obsidian-surface';

export default async function ObsidianPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <ObsidianSurface />;
}
