import type { Metadata } from 'next';
import { LegalScreen } from '@/components/screens/landing/legal-screen';

export const metadata: Metadata = { title: 'Terms of use' };

export default function TermsPage() {
  return <LegalScreen doc="terms" />;
}
