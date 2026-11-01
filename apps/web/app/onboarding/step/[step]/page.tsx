import { redirect } from 'next/navigation';
import { OnboardingStep } from './_components/onboarding-step';

export default async function StepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const stepNum = parseInt(step, 10);
  if (isNaN(stepNum) || stepNum < 1 || stepNum > 3) redirect('/onboarding/step/1');
  return <OnboardingStep step={stepNum} />;
}
