import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ForgotForm } from './_components/forgot-form';

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');
  return <ForgotForm />;
}
