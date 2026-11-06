'use client';
// HoloButton props: variant?: 'primary'|'ghost'|'danger', size?: 'sm'|'md'|'lg', loading?: boolean (disables, shows spinner, aria-busy)
// href?: string (renders a Next Link instead of a button), tone?: HoloTone, magnetic?: boolean (default true; pointer-follow nudge, off for reduced motion), leftIcon?, rightIcon?
// Plus all native button attributes. Focus ring and disabled states built in.
import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { toneClass, type HoloTone } from './tone';

export interface HoloButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  href?: string;
  tone?: HoloTone;
  magnetic?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export const HoloButton = React.forwardRef<HTMLElement, HoloButtonProps>(function HoloButton(
  { variant = 'primary', size = 'md', loading = false, href, tone = 'accent', magnetic = false, leftIcon, rightIcon, className, children, disabled, onPointerMove, onPointerLeave, type = 'button', ...rest },
  ref,
) {
  const localRef = React.useRef<HTMLElement | null>(null);
  const setRef = (el: HTMLElement | null) => {
    localRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = el;
  };
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerMove?.(e);
    const el = localRef.current;
    if (!magnetic || !el || e.pointerType === 'touch') return;
    const b = el.getBoundingClientRect();
    const dx = (e.clientX - (b.left + b.width / 2)) / b.width;
    const dy = (e.clientY - (b.top + b.height / 2)) / b.height;
    el.style.setProperty('--mx', `${(dx * 6).toFixed(2)}px`);
    el.style.setProperty('--my', `${(dy * 4).toFixed(2)}px`);
  };
  const leave = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerLeave?.(e);
    localRef.current?.style.setProperty('--mx', '0px');
    localRef.current?.style.setProperty('--my', '0px');
  };
  const cls = cn('holo-btn', toneClass(tone), className);
  const inner = (
    <>
      {loading ? <span className="holo-spinner" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
      {loading && <span className="sr-only">Loading</span>}
    </>
  );
  if (href && !disabled && !loading) {
    return (
      <Link ref={setRef as React.Ref<HTMLAnchorElement>} href={href} className={cls} data-variant={variant} data-size={size}
        onPointerMove={move as unknown as React.PointerEventHandler<HTMLAnchorElement>} onPointerLeave={leave as unknown as React.PointerEventHandler<HTMLAnchorElement>}>
        {inner}
      </Link>
    );
  }
  return (
    <button ref={setRef as React.Ref<HTMLButtonElement>} type={type} className={cls} data-variant={variant} data-size={size}
      disabled={disabled || loading} aria-busy={loading || undefined} onPointerMove={move} onPointerLeave={leave} {...rest}>
      {inner}
    </button>
  );
});
