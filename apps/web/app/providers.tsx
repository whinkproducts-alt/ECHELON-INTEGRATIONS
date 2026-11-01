'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler';

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        disableTransitionOnChange
        nonce={nonce}
      >
        {children}
        <Toaster />
        <ChunkLoadErrorHandler />
      </ThemeProvider>
    </SessionProvider>
  );
}
