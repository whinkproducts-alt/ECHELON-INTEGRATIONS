import { getBoardMembers } from '@/lib/board';
import { BoardScreen } from '@/components/screens/board/board-screen';

export default function Page() {
  // Board roster is tenant configuration, not secret: read on the server and pass as props.
  return <BoardScreen members={getBoardMembers()} />;
}
