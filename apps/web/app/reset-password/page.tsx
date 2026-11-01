import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ResetForm } from './_components/reset-form';

export default async function ResetPasswordPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  return <ResetForm />;
}
