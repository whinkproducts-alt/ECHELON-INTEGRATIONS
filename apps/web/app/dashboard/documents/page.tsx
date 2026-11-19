import { auth } from '@/auth';
import { PageHeader } from '@/components/ui/page-header';
import { redirect } from 'next/navigation';
import { UploadPanel } from './_components/upload-panel';

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <PageHeader title="Documents" description="Upload documents to include in recall. Answers will cite the source and page." />
      <UploadPanel />
    </div>
  );
}
