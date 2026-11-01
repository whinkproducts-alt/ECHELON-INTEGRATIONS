import companiesJson from '@/config/companies.json';

export type CompanyId = 'group' | 'apps' | 'ultimate';

export interface Company {
  id: CompanyId;
  name: string;
  role: string;
  logo: string;
  /** width / height of the logo file */
  aspect: number;
  /** Official website. Null until Victor supplies one; never guessed. */
  url: string | null;
  description: string;
}

const COMPANIES = companiesJson as Company[];

export function getCompanies(): Company[] {
  return COMPANIES;
}

export function getCompany(id: CompanyId): Company {
  const found = COMPANIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown company id: ${id}`);
  return found;
}
