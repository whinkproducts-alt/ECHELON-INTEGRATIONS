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
  /** 'human' = a real person. 'agent' = an invented AI persona with a named role. */
  kind: 'human' | 'agent';
}

/** Build firstname.lastname@whinkgroup.com: lowercase ascii, diacritics folded, apostrophes dropped, hyphens kept. */
export function staffEmail(firstName: string, lastName: string): string {
  const clean = (n: string) =>
    n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['\u2019\s]/g, '').replace(/[^a-z-]/g, '');
  return `${clean(firstName)}.${clean(lastName)}@whinkgroup.com`;
}

export const STAFF_EMAIL_RE = /^[a-z]+(-[a-z]+)*\.[a-z]+(-[a-z]+)*@whinkgroup\.com$/;

function agent(
  id: string, firstName: string, lastName: string, role: string, title: string, reportsTo: string,
): StaffMember {
  return {
    id, firstName, lastName, role, title,
    directorate: 'Innovation & Opportunity',
    reportsTo,
    email: staffEmail(firstName, lastName),
    status: 'pending',
    kind: 'agent',
  };
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
    imageUrl: '/board/victor-igboekwe.webp',
    status: 'active',
    kind: 'human',
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
    imageUrl: '/board/marcus-vale.webp',
    status: 'active',
    kind: 'human',
  },
  // Innovation & Opportunity Directorate: invented agent personas with human names.
  agent('amara-okafor', 'Amara', 'Okafor', 'Chief Innovation Officer', 'Chief Innovation & Opportunity Officer', 'victor-igboekwe'),
  agent('mateo-restrepo', 'Mateo', 'Restrepo', 'Opportunity Scout', 'Senior Opportunity Scout', 'amara-okafor'),
  agent('priya-raghunathan', 'Priya', 'Raghunathan', 'Market Analyst', 'Strategic Market Analyst', 'amara-okafor'),
  agent('soren-oconnell', 'Soren', "O'Connell", 'Growth Strategist', 'Growth Strategist, Existing Businesses', 'amara-okafor'),
  agent('mei-ling-tan', 'Mei-Ling', 'Tan', 'Venture Scout', 'Venture Scout, New Business Identification', 'amara-okafor'),
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
