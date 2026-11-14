import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ExecutiveHoloDashboard } from './_components/executive-holo-dashboard';

export default async function ExecutiveHoloPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <ExecutiveHoloDashboard userId={session.user.id} />;
}