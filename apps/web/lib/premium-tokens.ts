/**
 * ECHELON Premium Design Tokens — 10/10 Design System
 * Single source of truth for all premium UI components
 */

export const premiumTokens = {
  // Color System — Zinc base, Emerald accent (LILA BAN ENFORCED)
  colors: {
    // Base neutrals (light mode)
    canvas: '#FAFAFA',           // zinc-50
    surface: '#FFFFFF',          // white
    surfaceElevated: '#FFFFFF',
    border: '#E4E4E7',           // zinc-200
    borderStrong: '#D4D4D8',     // zinc-300

    // Ink
    ink: '#18181B',              // zinc-950
    inkSoft: '#71717A',          // zinc-500
    inkMuted: '#A1A1AA',         // zinc-400

    // Accent — SINGLE ACCENT ONLY
    accent: '#10B981',           // emerald-500
    accentHover: '#059669',      // emerald-600
    accentLight: '#D1FAE5',      // emerald-100
    accentInk: '#064E3B',        // emerald-900

    // Semantic
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    // Dark mode
    dark: {
      canvas: '#09090B',         // zinc-950
      surface: '#18181B',        // zinc-900
      surfaceElevated: '#27272A', // zinc-800
      border: '#3F3F46',         // zinc-700
      borderStrong: '#52525B',   // zinc-600
      ink: '#FAFAFA',            // zinc-50
      inkSoft: '#A1A1AA',        // zinc-400
      inkMuted: '#71717A',       // zinc-500
      accent: '#34D399',         // emerald-400
      accentHover: '#6EE7B7',    // emerald-300
      accentLight: '#064E3B',    // emerald-900
      accentInk: '#ECFDF5',      // emerald-50
    }
  },

  // Typography — Satoshi Variable
  typography: {
    fontDisplay: '"Satoshi Variable", "Outfit", "Cabinet Grotesk", system-ui, sans-serif',
    fontBody: '"Satoshi Variable", "Outfit", "Cabinet Grotesk", system-ui, sans-serif',
    fontMono: '"JetBrains Mono", "Fira Code", monospace',

    // Display scale (clamped for hero 2-3 line guarantee)
    display: {
      xxxl: 'clamp(4rem, 8vw, 7rem)',
      xxl: 'clamp(3.5rem, 6vw, 6rem)',
      xl: 'clamp(3rem, 5vw, 5rem)',
      lg: 'clamp(2.5rem, 4vw, 4rem)',
      md: 'clamp(2rem, 3vw, 3rem)',
      sm: 'clamp(1.5rem, 2.5vw, 2.5rem)',
    },

    // Body scale
    body: {
      xl: '1.25rem',    // 20px
      lg: '1.125rem',   // 18px
      md: '1rem',       // 16px
      sm: '0.875rem',   // 14px
      xs: '0.8125rem',  // 13px
    },

    // Tracking
    tracking: {
      tighter: '-0.03em',
      tight: '-0.02em',
      normal: '0',
      wide: '0.02em',
      wider: '0.04em',
    },

    // Leading
    leading: {
      none: '1',
      tight: '1.1',
      snug: '1.25',
      normal: '1.5',
      relaxed: '1.625',
      loose: '2',
    },

    // Max width for readability
    maxWidth: {
      prose: '65ch',
      narrow: '45ch',
      wide: '85ch',
    }
  },

  // Spacing — 4pt base, massive section gaps
  spacing: {
    base: '0.25rem',     // 4px
    xs: '0.5rem',        // 8px
    sm: '0.75rem',       // 12px
    md: '1rem',          // 16px
    lg: '1.5rem',        // 24px
    xl: '2rem',          // 32px
    '2xl': '3rem',       // 48px
    '3xl': '4rem',       // 64px
    '4xl': '6rem',       // 96px
    '5xl': '8rem',       // 128px
    '6xl': '12rem',      // 192px

    // Section gaps (Art Gallery Mode)
    section: {
      sm: '8rem',        // 128px
      md: '10rem',       // 160px
      lg: '12rem',       // 192px
      xl: '16rem',       // 256px
    }
  },

  // Border radius — rounded-3xl (2.5rem) for major containers
  radius: {
    none: '0',
    sm: '0.25rem',       // 4px
    md: '0.5rem',        // 8px
    lg: '0.75rem',       // 12px
    xl: '1rem',          // 16px
    '2xl': '1.5rem',     // 24px
    '3xl': '2.5rem',     // 40px — PRIMARY CONTAINER RADIUS
    full: '9999px',
  },

  // Shadows — Diffusion shadows only (no hard edges)
  shadows: {
    none: 'none',
    xs: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    sm: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    // Diffusion shadow for cards
    diffusion: '0 20px 40px -15px rgba(0, 0, 0, 0.05)',
    diffusionStrong: '0 30px 60px -20px rgba(0, 0, 0, 0.08)',
    // Inner refraction for liquid glass
    innerRefraction: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
  },

  // Motion — Spring physics, 200-300ms sweet spot
  motion: {
    easing: {
      easeOutQuint: [0.23, 1, 0.32, 1] as const,
      easeInOutCubic: [0.645, 0.045, 0.355, 1] as const,
      easeOutCubic: [0.33, 1, 0.68, 1] as const,
      springGentle: { type: 'spring', stiffness: 100, damping: 20 },
      springFirm: { type: 'spring', stiffness: 200, damping: 25 },
      springBouncy: { type: 'spring', stiffness: 300, damping: 20 },
      springMagnetic: { type: 'spring', stiffness: 400, damping: 30 },
    },
    duration: {
      instant: '50ms',
      fast: '150ms',
      normal: '250ms',
      slow: '350ms',
      slower: '500ms',
    },
    stagger: {
      tight: 0.05,
      normal: 0.1,
      loose: 0.15,
    }
  },

  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  // Container widths
  containers: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1400px',
    full: '100%',
  },

  // Z-index system (restrained)
  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    modal: 300,
    popover: 400,
    toast: 500,
    tooltip: 600,
  },

  // Glassmorphism / Liquid Glass
  glass: {
    background: 'rgba(255, 255, 255, 0.7)',
    backgroundDark: 'rgba(24, 24, 27, 0.7)',
    blur: '20px',
    border: '1px solid rgba(228, 228, 231, 0.5)',
    borderDark: '1px solid rgba(63, 63, 70, 0.5)',
    innerRefraction: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    innerRefractionDark: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  },

  // Avatar system
  avatar: {
    sizes: {
      xs: '2rem',        // 32px
      sm: '2.5rem',      // 40px
      md: '3rem',        // 48px
      lg: '4rem',        // 64px
      xl: '5rem',        // 80px
      '2xl': '6rem',     // 96px
      '3xl': '8rem',     // 128px
      full: '12rem',     // 192px — FULL BODY
      fullLarge: '16rem', // 256px — HERO FULL BODY
    },
    fullBody: {
      width: '12rem',    // 192px
      height: '18rem',   // 288px
      widthLarge: '16rem', // 256px
      heightLarge: '24rem', // 384px
    }
  }
} as const;

export type PremiumTokens = typeof premiumTokens;