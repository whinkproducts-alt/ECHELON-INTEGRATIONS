import { ECHELONDashboard } from '@/components/premium/ECHELONDashboard';

// Auth is enforced by app/dashboard/layout.tsx (server redirect to /login).
export default function DashboardPage() {
  return <ECHELONDashboard />;
}