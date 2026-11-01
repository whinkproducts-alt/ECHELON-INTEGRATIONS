'use client';
// HoloModal props: open: boolean, onOpenChange: (open)=>void, title: string, description?: ReactNode, children, footer?: ReactNode, tone?: HoloTone, width?: string (CSS length, default '32rem')
// HoloDrawer props: same plus side?: 'right'|'left'|'bottom' (default 'right'), width?: string
// Built on Radix Dialog (focus trap, Escape, aria). Use tone="amber" with a text label for pending approvals.
import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HoloTone } from './tone';
import { toneClass } from './tone';

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: HoloTone;
  width?: string;
  className?: string;
}

function Body({ title, description, children, footer }: Pick<BaseProps, 'title' | 'description' | 'children' | 'footer'>) {
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Dialog.Title className="font-display text-xl font-semibold tracking-tight text-foreground">{title}</Dialog.Title>
          {description ? <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
        </div>
        <Dialog.Close className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="Close">
          <X className="h-4 w-4" aria-hidden />
        </Dialog.Close>
      </div>
      <div className="text-sm text-foreground">{children}</div>
      {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
    </>
  );
}

export function HoloModal({ open, onOpenChange, tone = 'accent', width = '32rem', className, ...body }: BaseProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="holo-overlay" />
        <Dialog.Content className={cn('holo-modal holo-panel p-6', toneClass(tone), className)} data-glow="soft" style={{ '--holo-modal-w': width } as React.CSSProperties}>
          <Body {...body} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function HoloDrawer({ open, onOpenChange, tone = 'accent', width = '28rem', side = 'right', className, ...body }: BaseProps & { side?: 'right' | 'left' | 'bottom' }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="holo-overlay" />
        <Dialog.Content data-side={side} className={cn('holo-drawer holo-panel p-6', toneClass(tone), className)} style={{ '--holo-drawer-w': width, borderRadius: 0 } as React.CSSProperties}>
          <Body {...body} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
