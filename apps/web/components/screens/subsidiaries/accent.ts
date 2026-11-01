// Per-subsidiary accent, derived by eye from each logo. HSL triplets (no hex) written to --sub-c on the screen root.
// Amber and denial red are reserved elsewhere, so frontliners uses a deeper orange and real estate a pink.
const ACCENTS: Record<string, string> = {
  consult: '266 82% 64%',
  'real-estate': '338 82% 62%',
  trades: '152 68% 46%',
  apps: '188 90% 55%',
  frontliners: '22 92% 54%',
  unassigned: '215 14% 62%',
};
export const accentStyle = (id: string): React.CSSProperties => ({ ['--sub-c' as string]: ACCENTS[id] ?? ACCENTS.unassigned } as React.CSSProperties);
export const logoAspect = (id: string) => (id === 'apps' ? '3 / 2' : '1 / 1');
