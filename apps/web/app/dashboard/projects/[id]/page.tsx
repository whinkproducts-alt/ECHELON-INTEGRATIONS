import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ProjectDetail } from './_components/project-detail';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { id } = await params;
  return <ProjectDetail projectId={id} />;
}
