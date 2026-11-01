import type { Metadata } from 'next';
import { LegalScreen } from '@/components/screens/landing/legal-screen';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return <LegalScreen doc="privacy" />;
}
