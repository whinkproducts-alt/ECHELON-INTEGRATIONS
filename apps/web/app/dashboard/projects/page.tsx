import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ProjectsSurface } from './_components/projects-surface';

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <ProjectsSurface />;
}
