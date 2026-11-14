import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ExecutiveCorporateDashboard } from './_components/executive-corporate-dashboard';

export default async function ExecutiveCorporatePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <ExecutiveCorporateDashboard userId={session.user.id} />;
}
