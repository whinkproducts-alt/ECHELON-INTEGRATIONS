'use client';
// InstallInstructions props: className. Plain-text steps for installing the web app on a Mac. Safe to place on the Settings screen.
import * as React from 'react';

export function InstallInstructions({ className }: { className?: string }) {
  return (
    <div className={className}>
      <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">On a Mac</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Safari: open the File menu, then choose Add to Dock.</li>
        <li>Chrome or Edge: choose Install in the address bar, or the browser menu, then Install.</li>
      </ul>
      <h3 className="mt-4 font-display text-sm font-semibold tracking-wide text-foreground">On a phone</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>iPhone: Share, then Add to Home Screen.</li>
        <li>Android: browser menu, then Install app.</li>
      </ul>
    </div>
  );
}
