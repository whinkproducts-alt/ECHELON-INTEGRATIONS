import catalog from './official-assets.json';

const find = (path: string) => {
  const asset = catalog.assets.find((entry) => entry.packaged_path === path);
  if (!asset) throw new Error(`Official asset missing: ${path}`);
  return asset.src;
};
export const officialAssets = {
  whink: find('assets/personas/whink.png'),
  mamba: find('assets/personas/mamba.png'),
  group: find('assets/brand/whink-group.png'),
  ultimate: Array.from({ length: 8 }, (_, i) => find(`assets/whink-ultimate/ultimate-${String(i + 1).padStart(2, '0')}.png`)),
  subsidiaries: {
    apps: find('assets/subsidiaries/whink-apps.png'),
    consult: find('assets/subsidiaries/whink-consult.png'),
    'real-estate': find('assets/subsidiaries/whink-real-estate.png'),
    frontliners: find('assets/subsidiaries/whink-frontliners.png'),
    trades: find('assets/subsidiaries/whink-trades-investment.png'),
  },
};
