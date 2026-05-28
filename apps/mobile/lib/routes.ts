// Central route constants — avoids scattered hardcoded strings across screens.
// typedRoutes is disabled in app.config.js so no Expo Router generated types needed.

export const Routes = {
  // ── Tabs ──────────────────────────────────────────────────────────────────
  discovery:            '/(app)/(tabs)/discovery',
  motives:              '/(app)/(tabs)/motives',
  motiveCreate:         '/(app)/(tabs)/motives/create',
  motive:               (id: string) => `/(app)/(tabs)/motives/${id}`,
  motiveEdit:           (id: string) => `/(app)/(tabs)/motives/${id}/edit`,
  motiveMemory:         (id: string) => `/(app)/(tabs)/motives/${id}/memory`,
  motiveMemories:       (id: string) => `/(app)/(tabs)/motives/${id}/memories`,
  chatList:             '/(app)/(tabs)/chat',
  chat:                 (id: string) => `/(app)/(tabs)/chat/${id}`,
  chatNewGroup:         '/(app)/(tabs)/chat/new-group',
  profile:              '/(app)/(tabs)/profile',
  profileEdit:          '/(app)/(tabs)/profile/edit',
  profileSettings:      '/(app)/(tabs)/profile/settings',
  profileConnections:   '/(app)/(tabs)/profile/connections',
  profileCircles:       '/(app)/(tabs)/profile/circles',
  profileCreateCircle:  '/(app)/(tabs)/profile/create-circle',
  profileCircleDetail:  (id: string) => ({ pathname: '/(app)/(tabs)/profile/circle-detail' as const, params: { id } }),
  profileEditCircle:    (id: string) => ({ pathname: '/(app)/(tabs)/profile/edit-circle' as const, params: { id } }),

  // ── App screens ───────────────────────────────────────────────────────────
  discoverPeople:   '/(app)/discover-people',
  discoverCircles:  '/(app)/discover-circles',
  findFriends:      '/(app)/find-friends',
  explore:          '/(app)/explore',
  onboarding:       (step: 1 | 2 | 3 | 4 | 5 | 6) => `/(app)/onboarding/step-${step}`,
  userProfile:      (id: string, name?: string, avatarUrl?: string) =>
                      ({ pathname: '/(app)/user/[id]' as const, params: { id, name, avatarUrl } }),
  onboardingEditVibes: { pathname: '/(app)/onboarding/step-2' as const, params: { returnTo: 'profile' as const } },

  // ── Auth ──────────────────────────────────────────────────────────────────
  signup:               '/(auth)/signup',
  magicLinkCallback:    '/(auth)/magic-link-callback',
} as const;
