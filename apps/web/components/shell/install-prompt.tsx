'use client';
// InstallPrompt props: className. Renders an "Install app" button unless the app already runs standalone.
// Uses beforeinstallprompt where the browser offers it; otherwise opens a dialog with Mac steps (see InstallInstructions).
// Tenant name comes from useTenantConfig.
import * as React from 'react';
import { Download } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { HoloButton, HoloModal } from '@/components/ui/holo';
import { InstallInstructions } from './install-instructions';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function subscribeStandalone(cb: () => void) {
  const mq = window.matchMedia('(display-mode: standalone)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function InstallPrompt({ className }: { className?: string }) {
  const { appName } = useTenantConfig();
  const standalone = React.useSyncExternalStore(subscribeStandalone, () => window.matchMedia('(display-mode: standalone)').matches, () => false);
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  if (standalone) return null;
  const install = async () => {
    if (!deferred) { setOpen(true); return; }
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };
  return (
    <>
      <HoloButton variant="ghost" size="sm" className={className} onClick={install} leftIcon={<Download className="h-3.5 w-3.5" aria-hidden />}>
        Install app
      </HoloButton>
      <HoloModal open={open} onOpenChange={setOpen} title={`Install ${appName}`} description="Run it in its own window, like a native app.">
        <InstallInstructions />
      </HoloModal>
    </>
  );
}
