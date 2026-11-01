import type { MetadataRoute } from 'next';
import tenantDefaults from '@/config/tenant-defaults.json';

// Names and the theme colour come from config/tenant-defaults.json (tenant config defaults).
export default function manifest(): MetadataRoute.Manifest {
  const name = tenantDefaults.appName;
  return {
    name,
    short_name: name,
    description: tenantDefaults.description,
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: tenantDefaults.themeColor,
    theme_color: tenantDefaults.themeColor,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Today', url: '/dashboard/today', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Board', url: '/dashboard/board', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Command', url: '/dashboard', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
