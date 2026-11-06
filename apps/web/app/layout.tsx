import './globals.css';
import './futuristic.css';
import { Providers } from './providers';
import type { Metadata, Viewport } from 'next';
import tenantDefaults from '@/config/tenant-defaults.json';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: tenantDefaults.appName, template: `%s | ${tenantDefaults.appName}` },
  description: tenantDefaults.description,
  applicationName: tenantDefaults.appName,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, title: tenantDefaults.appName, statusBarStyle: 'black-translucent' },
  openGraph: {
    title: tenantDefaults.appName,
    siteName: tenantDefaults.appName,
    description: tenantDefaults.description,
    images: ['/og-image.png'],
  },
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
};

export const viewport: Viewport = {
  themeColor: tenantDefaults.themeColor,
  colorScheme: 'dark',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head />
      <body className="font-sans antialiased">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
