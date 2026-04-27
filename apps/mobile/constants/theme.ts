// Icebreaker Design System v2.0 — Hybrid Warm Cream + Dark Moments
// Fonts: Fraunces (headings, italic display) + DM Sans (body)
//
// Design language: Warm cream (#F8F2E8) for all browsing/social screens.
// Dark (#181614) reserved for high-engagement moments: prompt card, match reveal,
// memory creation, creation wizards. This creates emotional rhythm — open & daylit
// for discovery, intimate & focused for engagement.

export const Colors = {
  light: {
    // ── Brand ─────────────────────────────────────────────────────────────────
    primary:       '#FF6B35',   // Warm orange — CTAs, active states, badges
    primaryMuted:  '#FFE8DC',   // Light orange tint — hover, selected bg
    secondary:     '#2D6A4F',   // Deep green — success, "going" state

    // ── Backgrounds ────────────────────────────────────────────────────────────
    // Primary: warm cream for ALL browsing screens (discovery, motives, chat, connections)
    background:     '#F8F2E8',  // Warm cream — primary page background
    // Richer cream for profile content sections, settings
    backgroundWarm: '#FBF5EC',  // Slightly richer cream — profile, settings, auth
    // Dark engagement surfaces — prompt card, memory flow, match reveal
    backgroundDark: '#181614',  // Near-black warm — the "moment" surface
    backgroundDarkDeep: '#100D0B', // Auth welcome, full-screen dark overlays

    // Card surfaces — white on cream creates clean separation
    surface:    '#FFFFFF',      // Card background on cream screens
    surfaceAlt: '#F5EEE5',      // Tags, pills, input backgrounds (slightly warm)

    // ── Text ──────────────────────────────────────────────────────────────────
    text:          '#1A1A1A',   // Primary text on light surfaces
    textSecondary: '#7A6A5A',   // Secondary — warmer than generic #666
    textTertiary:  '#B0A090',   // Captions, timestamps — the warm neutral tone
    textInverse:   '#FFFFFF',   // Text on dark/orange surfaces

    // ── UI Elements ───────────────────────────────────────────────────────────
    border:      'rgba(0,0,0,0.08)',  // Borders on cream — subtle warm separation
    borderWarm:  'rgba(0,0,0,0.05)', // Ultra-subtle borders (cards on cream)
    borderFocus: '#FF6B35',           // Focused input border
    icon:        '#7A6A5A',           // Default icon color — warm gray
    tabIconDefault:  '#B0A090',       // Tab icon inactive — warm neutral
    tabIconSelected: '#FF6B35',       // Tab icon active — orange

    // ── Shadows ───────────────────────────────────────────────────────────────
    // Cards on cream need subtle warm-toned shadows
    cardShadowColor: '#8B6A4A',      // Warm brown shadow (not cold black)

    // ── Status ────────────────────────────────────────────────────────────────
    success: '#2D6A4F',
    warning: '#F4A261',
    error:   '#E63946',

    tint: '#FF6B35', // legacy
  },
  dark: {
    primary:       '#FF8C5A',
    primaryMuted:  '#3D2015',
    secondary:     '#52B788',
    background:    '#100D0B',
    backgroundWarm:'#1A1512',
    surface:       '#1A1512',
    surfaceAlt:    '#231D18',
    text:          '#F2E8DC',
    textSecondary: 'rgba(242,232,220,0.55)',
    textTertiary:  'rgba(242,232,220,0.30)',
    textInverse:   '#100D0B',
    border:        'rgba(255,107,53,0.09)',
    borderWarm:    'rgba(255,107,53,0.06)',
    borderFocus:   '#FF8C5A',
    icon:          'rgba(242,232,220,0.55)',
    tabIconDefault:  'rgba(242,232,220,0.35)',
    tabIconSelected: '#FF8C5A',
    cardShadowColor: '#000',
    success: '#52B788',
    warning: '#F4A261',
    error:   '#FF6B6B',
    tint: '#FF8C5A',
  },
} as const;

export const Fonts = {
  heading:        'Fraunces_600SemiBold',
  headingRegular: 'Fraunces_400Regular',
  body:           'DMSans_400Regular',
  bodySemiBold:   'DMSans_600SemiBold',
  bodyBold:       'DMSans_700Bold',
} as const;

export const Spacing = {
  xs: 4, sm: 8, md: 12, base: 16,
  lg: 20, xl: 24, '2xl': 32, '3xl': 40, '4xl': 48, '5xl': 64,
} as const;

export const Radius = {
  sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, full: 999,
} as const;

export const Shadow = {
  // Warm-toned shadows for cards on cream backgrounds
  sm: {
    shadowColor: '#8B6A4A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#8B6A4A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: '#8B6A4A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  // Dark moment surfaces keep cold black shadows
  dark: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 16,
  },
} as const;

export type ColorScheme = 'light' | 'dark';
export type ThemeColors = typeof Colors.light;
