import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TasksSurface } from './_components/tasks-surface';

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <TasksSurface />;
}
