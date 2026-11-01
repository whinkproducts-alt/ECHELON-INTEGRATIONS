'use client';

/**
 * Obsidian overlay — wraps the conversation panel when MAMBA is in OBSIDIAN mode.
 * Visual shift: faint blood-red radial gradient from top-right + ember border.
 * All colours via CSS custom properties — no hardcoded hex in JSX.
 */
export function ObsidianOverlay({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex flex-col flex-1 min-h-0"
      style={{
        transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
        borderRadius: 'var(--radius)',
        border: active
          ? '2px solid hsl(var(--mamba-blood) / 0.4)'
          : '2px solid transparent',
        boxShadow: active
          ? 'inset 0 0 80px 0 hsl(var(--mamba-blood) / 0.04)'
          : 'none',
        backgroundImage: active
          ? 'radial-gradient(ellipse at top right, hsl(var(--mamba-blood) / 0.04) 0%, transparent 60%)'
          : 'none',
        animation: active ? 'obsidian-fade-in 0.4s ease' : undefined,
      }}
      data-obsidian={active}
    >
      {/* OBSIDIAN label */}
      {active && (
        <span
          aria-label="MAMBA Obsidian mode active"
          className="absolute top-2 right-3 z-10 text-[10px] font-mono tracking-widest pointer-events-none select-none"
          style={{ color: 'hsl(var(--ember))' }}
        >
          OBSIDIAN
        </span>
      )}
      {children}
    </div>
  );
}
