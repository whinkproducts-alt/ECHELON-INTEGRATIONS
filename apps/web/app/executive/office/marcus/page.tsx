import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { MarcusConversation } from '../_components/marcus-conversation';

export default async function MarcusPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <MarcusConversation />;
}
