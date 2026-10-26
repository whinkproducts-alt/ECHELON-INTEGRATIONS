import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { LandingScreen } from '@/components/screens/landing/landing-screen';

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  return <LandingScreen />;
}
