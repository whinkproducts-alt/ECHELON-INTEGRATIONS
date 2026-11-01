import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { UploadPanel } from './_components/upload-panel';

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload documents to include in recall. Answers will cite the source and page.
        </p>
      </div>
      <UploadPanel />
    </div>
  );
}
