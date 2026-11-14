import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { FounderOffice } from './_components/founder-office';

export default async function OfficePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <FounderOffice userId={session.user.id} userEmail={session.user.email ?? null} />;
}