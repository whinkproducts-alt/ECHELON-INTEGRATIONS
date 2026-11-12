import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { mediaReadiness } from '@/lib/model-router/higgsfield/config';
import { MediaStudio } from './studio';
export default async function MediaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  return <MediaStudio readiness={mediaReadiness(session.user.id)} />;
}
