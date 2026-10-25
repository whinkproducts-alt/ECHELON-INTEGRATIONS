import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { NewsSurface } from '@/components/holo/news-surface';

export default async function NewsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <NewsSurface />;
}
