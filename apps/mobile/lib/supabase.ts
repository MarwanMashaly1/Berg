import { createClient } from '@supabase/supabase-js';
import { Config } from './config';

// Guard: if env vars are missing, log a clear error instead of crashing.
// Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to apps/mobile/.env
if (!Config.supabaseUrl || !Config.supabaseAnonKey) {
  console.error(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
    'Add them to apps/mobile/.env — get values from Supabase Dashboard → Settings → API',
  );
}

export const supabase = Config.supabaseUrl && Config.supabaseAnonKey
  ? createClient(Config.supabaseUrl, Config.supabaseAnonKey, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
      auth: {
        // BetterAuth handles auth — disable Supabase auth entirely
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null as any; // Will be null if env vars missing — chat realtime won't work but app won't crash
