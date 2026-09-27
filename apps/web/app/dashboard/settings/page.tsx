import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { SettingsSurface } from './_components/settings-surface';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <SettingsSurface />;
}
