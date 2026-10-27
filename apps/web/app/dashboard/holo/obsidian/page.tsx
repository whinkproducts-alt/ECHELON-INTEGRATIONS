import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ObsidianSurface } from '@/components/holo/obsidian-surface';
import { prisma } from '@/lib/db';

export default async function ObsidianPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // Display guard: only show Obsidian if the active persona is MAMBA/Obsidian.
  // This is a display guard only — permissions are still enforced by the permission engine.
  const state = await prisma.personaState.findUnique({
    where: { userId: session.user.id },
    select: { activePersona: true, mambaMode: true },
  });
  if (state?.activePersona !== 'MAMBA' || state?.mambaMode !== 'OBSIDIAN') {
    redirect('/dashboard/holo');
  }

  return <ObsidianSurface />;
}
