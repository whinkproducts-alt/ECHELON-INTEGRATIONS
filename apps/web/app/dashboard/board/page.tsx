import { auth } from '@/auth';
import { getBoardMembers } from '@/lib/board';
import { isOwnerEmail } from '@/lib/owner';
import { BoardScreen } from '@/components/screens/board/board-screen';
import { HoloEmpty } from '@/components/ui/holo';

export default async function Page() {
  // The roster is operator configuration: only owner accounts (WHINK_OWNER_EMAILS) may see it.
  const session = await auth();
  if (!isOwnerEmail(session?.user?.email)) {
    return (
      <div className="p-8">
        <HoloEmpty
          title="Board Room is owner only"
          description="The board roster is visible to owner accounts. Add your sign-in email to WHINK_OWNER_EMAILS on the server, then reload."
        />
      </div>
    );
  }
  return <BoardScreen members={getBoardMembers()} />;
}
