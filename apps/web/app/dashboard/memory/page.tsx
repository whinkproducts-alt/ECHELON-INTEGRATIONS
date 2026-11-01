import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { MemorySurface } from './_components/memory-surface';

export default async function MemoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <MemorySurface />;
}
