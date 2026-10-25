import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ObsidianSurface } from '@/components/holo/obsidian-surface';
import { prisma } from '@/lib/db';

export default async function ObsidianPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // Display guard: only show Obsidian if the active persona is MAMBA/Obsidian.
  // This is a display guard only — permissions are still enforced by the permission engine.
  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
    select: { activePersona: true, mambaMode: true },
  });
  if (pref?.activePersona !== 'MAMBA' || pref?.mambaMode !== 'OBSIDIAN') {
    redirect('/dashboard/holo');
  }

  return <ObsidianSurface />;
}
