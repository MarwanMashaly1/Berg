// Motive category config — used across list, creation wizard, and detail screens

export type CategoryKey =
  | 'food' | 'outdoors' | 'catchup' | 'movies'
  | 'active' | 'party' | 'gaming' | 'travel' | 'creative';

export type CategoryConfig = {
  key: CategoryKey;
  label: string;
  emoji: string;
  color: string;
  tint: string;
};

export const CATEGORIES: CategoryConfig[] = [
  { key: 'food',     label: 'Food',          emoji: '🍕', color: '#FF6B35', tint: 'rgba(255,107,53,0.07)' },
  { key: 'outdoors', label: 'Outdoors',      emoji: '🏕',  color: '#4CAF81', tint: 'rgba(76,175,129,0.07)' },
  { key: 'catchup',  label: 'Catch-up',      emoji: '☕',  color: '#C09060', tint: 'rgba(192,144,96,0.07)' },
  { key: 'movies',   label: 'Movies',        emoji: '🎬', color: '#6488C8', tint: 'rgba(100,136,200,0.07)' },
  { key: 'active',   label: 'Active',        emoji: '🏃', color: '#2EC4B6', tint: 'rgba(46,196,182,0.07)' },
  { key: 'party',    label: 'Hangout',       emoji: '🫂', color: '#C84B7A', tint: 'rgba(200,75,122,0.07)' },
  { key: 'gaming',   label: 'Gaming',        emoji: '🎮', color: '#7B5EA7', tint: 'rgba(123,94,167,0.07)' },
  { key: 'travel',   label: 'Travel',        emoji: '✈️', color: '#3A8FC4', tint: 'rgba(58,143,196,0.07)' },
  { key: 'creative', label: 'Creative',      emoji: '🎨', color: '#E08040', tint: 'rgba(224,128,64,0.07)' },
];

export const CATEGORY_MAP = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c])
) as Record<CategoryKey, CategoryConfig>;

// Initials avatar color presets (6 distinct colors, all work with white text)
export const AVATAR_COLORS = [
  '#E8570A', '#2D6A4F', '#2563EB', '#7C3AED', '#B45309', '#0891B2',
] as const;

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
