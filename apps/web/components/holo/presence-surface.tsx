'use client';

import { ConversationSurface } from '@/app/dashboard/conversation/_components/conversation-surface';

/** Uses the governed conversation flow, not a simulated voice session. */
export function PresenceSurface(_props: { userName?: string } = {}) {
  return <ConversationSurface presentation="presence" />;
}
