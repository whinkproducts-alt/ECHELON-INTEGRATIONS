// Staff directory for The WHINK Group.
// Email format: firstname.lastname@whinkgroup.com
// Titles and roles are non-sensitive config data, not secrets.

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  title: string;
  directorate: string;
  reportsTo: string | null; // id of manager, null = reports to Victor
  email: string;
  phone?: string; // E.164 format when known
  imageUrl?: string;
  status: 'active' | 'pending' | 'inactive';
}

export const STAFF_DIRECTORY: StaffMember[] = [
  {
    id: 'victor-igboekwe',
    firstName: 'Victor',
    lastName: 'Igboekwe',
    role: 'Founder & CEO',
    title: 'Founder, Chairman & Chief Executive Officer',
    directorate: 'Executive Office',
    reportsTo: null,
    email: 'victor.igboekwe@whinkgroup.com',
    status: 'active',
  },
  {
    id: 'marcus-vale',
    firstName: 'Marcus',
    lastName: 'Vale',
    role: 'Executive Assistant',
    title: 'Executive Assistant to the CEO',
    directorate: 'Executive Office',
    reportsTo: 'victor-igboekwe',
    email: 'marcus.vale@whinkgroup.com',
    status: 'active',
  },
  // Innovation & Opportunity Directorate (new — see Task 2)
  {
    id: 'innovation-lead',
    firstName: 'Innovation',
    lastName: 'Lead',
    role: 'Chief Innovation Officer',
    title: 'Chief Innovation & Opportunity Officer',
    directorate: 'Innovation & Opportunity',
    reportsTo: 'victor-igboekwe',
    email: 'innovation.lead@whinkgroup.com',
    status: 'pending',
  },
  {
    id: 'scout-one',
    firstName: 'Opportunity',
    lastName: 'Scout',
    role: 'Opportunity Scout',
    title: 'Senior Opportunity Scout',
    directorate: 'Innovation & Opportunity',
    reportsTo: 'innovation-lead',
    email: 'opportunity.scout@whinkgroup.com',
    status: 'pending',
  },
  {
    id: 'market-analyst',
    firstName: 'Market',
    lastName: 'Analyst',
    role: 'Market Analyst',
    title: 'Strategic Market Analyst',
    directorate: 'Innovation & Opportunity',
    reportsTo: 'innovation-lead',
    email: 'market.analyst@whinkgroup.com',
    status: 'pending',
  },
  {
    id: 'growth-hacker',
    firstName: 'Growth',
    lastName: 'Strategist',
    role: 'Growth Strategist',
    title: 'Growth Strategist — Existing Businesses',
    directorate: 'Innovation & Opportunity',
    reportsTo: 'innovation-lead',
    email: 'growth.strategist@whinkgroup.com',
    status: 'pending',
  },
  {
    id: 'venture-scout',
    firstName: 'Venture',
    lastName: 'Scout',
    role: 'Venture Scout',
    title: 'Venture Scout — New Business Identification',
    directorate: 'Innovation & Opportunity',
    reportsTo: 'innovation-lead',
    email: 'venture.scout@whinkgroup.com',
    status: 'pending',
  },
];

export function getStaffByEmail(email: string): StaffMember | undefined {
  return STAFF_DIRECTORY.find((s) => s.email.toLowerCase() === email.toLowerCase());
}

export function getStaffByDirectorate(directorate: string): StaffMember[] {
  return STAFF_DIRECTORY.filter((s) => s.directorate === directorate);
}

export function getDirectReports(managerId: string): StaffMember[] {
  return STAFF_DIRECTORY.filter((s) => s.reportsTo === managerId);
}
