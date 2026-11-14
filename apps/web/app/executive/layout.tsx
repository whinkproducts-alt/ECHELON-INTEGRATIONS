import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ExecutiveShell } from '@/app/executive/_components/executive-shell';

export default async function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <ExecutiveShell user={session.user}>{children}</ExecutiveShell>;
}