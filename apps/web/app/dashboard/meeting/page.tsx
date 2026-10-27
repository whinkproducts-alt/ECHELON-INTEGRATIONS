import { auth } from '@/auth';
import { getBoardMembers } from '@/lib/board';
import { isOwnerEmail } from '@/lib/owner';
import { MeetingScreen } from '@/components/screens/meeting/meeting-screen';
import { toMeetingProps } from '@/components/screens/meeting/props';
import { HoloEmpty } from '@/components/ui/holo';

export default async function Page() {
  // The roster is operator configuration: only owner accounts (WHINK_OWNER_EMAILS) may see it.
  const session = await auth();
  if (!isOwnerEmail(session?.user?.email)) {
    return (
      <div className="p-8">
        <HoloEmpty
          title="Meeting room is owner only"
          description="The meeting room uses the board roster, which is visible to owner accounts. Add your sign-in email to WHINK_OWNER_EMAILS on the server, then reload."
        />
      </div>
    );
  }
  return <MeetingScreen {...toMeetingProps(getBoardMembers())} />;
}
