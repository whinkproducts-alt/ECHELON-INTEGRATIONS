import { STAFF_DIRECTORY } from '@/lib/staff-directory';
import { DirectoryScreen } from '@/components/screens/directory/directory-screen';

export default function Page() {
  // Staff directory is non-secret config data: read on the server and pass as props.
  return <DirectoryScreen staff={STAFF_DIRECTORY} />;
}
