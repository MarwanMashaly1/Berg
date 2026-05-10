import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const MEMORIES_BUCKET = 'motive-memories';
export const CHAT_IMAGES_BUCKET = 'chat-images';
export const AVATARS_BUCKET = 'avatars';
export const CIRCLE_IMAGES_BUCKET = 'circle-images';
export const SIGNED_URL_TTL = 3600; // 1 hour
