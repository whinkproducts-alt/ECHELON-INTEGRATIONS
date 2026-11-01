import { RosterScreen } from '@/components/screens/roster/roster-screen';
import { getRosterView } from '@/components/screens/roster/server-data';

export default function Page() {
  return <RosterScreen {...getRosterView()} />;
}
