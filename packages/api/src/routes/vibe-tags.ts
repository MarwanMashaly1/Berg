import { Hono } from 'hono';
import { db } from '../db.js';
import { vibeTags } from '@berg/shared';
import { cache, TTL, CK } from '../lib/cache.js';
import type { auth } from '../auth.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const vibeTagRoutes = new Hono<{ Variables: Variables }>();

// GET /api/vibe-tags -- list all vibe tags (public, no auth needed)
// Cached for 1 hour -- the tag list never changes in production
vibeTagRoutes.get('/', async (c) => {
  const tags = await cache.wrap(
    CK.vibeTags(),
    TTL.VIBE_TAGS,
    () => db.select().from(vibeTags).orderBy(vibeTags.category, vibeTags.label),
  );
  c.header('X-Cache', cache.get(CK.vibeTags()) ? 'HIT' : 'MISS');
  return c.json({ tags });
});
