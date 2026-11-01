import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { CommandSurface } from './_components/command-surface';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <CommandSurface />;
}
