'use client';

import { ConversationSurface } from '@/app/dashboard/conversation/_components/conversation-surface';

/** The route retains its existing server-side MAMBA/Obsidian display guard. */
export function ObsidianSurface() {
  return <ConversationSurface presentation="obsidian" />;
}
