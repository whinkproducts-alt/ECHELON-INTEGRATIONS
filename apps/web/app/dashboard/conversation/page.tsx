import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ConversationSurface } from './_components/conversation-surface';
import { sanitizePromptParam } from '@/components/screens/conversation-helpers/slash-commands';

export default async function ConversationPage({ searchParams }: { searchParams: Promise<{ prompt?: string | string[] }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  // ?prompt= is read as plain text only, capped, and never sent automatically.
  const { prompt } = await searchParams;
  return <ConversationSurface initialPrompt={sanitizePromptParam(prompt)} />;
}
