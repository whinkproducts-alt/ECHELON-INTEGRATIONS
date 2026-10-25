import { notFound, redirect } from 'next/navigation';
import { isSubsidiaryId } from '@/lib/subsidiaries';
import { ProjectReportScreen } from '@/components/screens/subsidiaries/project-report-screen';

export default async function Page({ params }: { params: Promise<{ id: string; projectId: string }> }) {
  const { id, projectId } = await params;
  if (id === 'unassigned') redirect(`/dashboard/projects/${encodeURIComponent(projectId)}`);
  if (!isSubsidiaryId(id)) notFound();
  return <ProjectReportScreen subsidiaryId={id} projectId={projectId} />;
}
