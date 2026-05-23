export const Config = {
  apiUrl:         process.env.EXPO_PUBLIC_API_URL       ?? 'http://localhost:3000',
  supabaseUrl:    process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '',
  supabaseAnonKey:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  sentryDsn:      process.env.EXPO_PUBLIC_SENTRY_DSN,
  posthogKey:     process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
  posthogHost:    process.env.EXPO_PUBLIC_POSTHOG_HOST   ?? 'https://us.i.posthog.com',
  tenorKey:       process.env.EXPO_PUBLIC_TENOR_API_KEY  ?? '',
} as const;
