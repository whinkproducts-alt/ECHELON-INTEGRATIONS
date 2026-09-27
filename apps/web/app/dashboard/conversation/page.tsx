import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ConversationSurface } from './_components/conversation-surface';

export default async function ConversationPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <ConversationSurface />;
}
