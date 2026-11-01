import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { HoloSurface } from '@/components/holo/holo-surface';

export default async function HoloPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <HoloSurface />;
}
