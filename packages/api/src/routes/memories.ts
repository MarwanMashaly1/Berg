import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { motives, motiveAttendees, motiveMemories, users } from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin, MEMORIES_BUCKET, SIGNED_URL_TTL } from '../lib/supabase-admin.js';
import type { auth } from '../auth.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const memoriesRoutes = new Hono<{ Variables: Variables }>();
memoriesRoutes.use('*', requireAuth);

// -- Helper: assert caller is an attendee of the motive -----------------------
async function assertAttendee(motiveId: string, userId: string) {
  const [row] = await db
    .select({ motiveId: motiveAttendees.motiveId })
    .from(motiveAttendees)
    .where(and(eq(motiveAttendees.motiveId, motiveId), eq(motiveAttendees.userId, userId)))
    .limit(1);
  return !!row;
}

// -- Helper: generate fresh signed read URLs for an array of storage paths ----
async function signPaths(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabaseAdmin.storage
    .from(MEMORIES_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (error || !data) return [];
  return data.map((d) => d.signedUrl ?? '').filter(Boolean);
}

// -- POST /api/motives/:id/memories/upload-url ---------------------------------
// Returns a signed upload URL. Mobile uploads directly to Supabase Storage.
memoriesRoutes.post('/:id/memories/upload-url', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');
  const { contentType = 'image/jpeg', ext = 'jpg' } = await c.req.json<{
    contentType?: string;
    ext?: string;
  }>();

  if (!(await assertAttendee(motiveId, me.id))) {
    return c.json({ error: 'not an attendee' }, 403);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  if (!allowedTypes.includes(contentType)) {
    return c.json({ error: 'unsupported content type' }, 400);
  }

  // UUID path -- completely unguessable, no PII
  const fileId = randomUUID();
  const path = `${motiveId}/${me.id}/${fileId}.${ext.replace(/[^a-z0-9]/gi, '')}`;

  const { data, error } = await supabaseAdmin.storage
    .from(MEMORIES_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error('[memories] createSignedUploadUrl error:', JSON.stringify(error));
    return c.json({ error: `could not create upload URL: ${error?.message ?? 'unknown'}` }, 500);
  }

  return c.json({ uploadUrl: data.signedUrl, path, token: data.token });
});

// -- POST /api/motives/:id/memories/confirm ------------------------------------
// Called after a successful upload. Saves the storage path to the DB.
memoriesRoutes.post('/:id/memories/confirm', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');
  const { path } = await c.req.json<{ path: string }>();

  if (!path) return c.json({ error: 'path is required' }, 400);

  // Reject path traversal sequences and excessive length
  if (path.includes('..') || path.includes('//')) {
    return c.json({ error: 'Invalid path' }, 400);
  }
  if (path.length > 500) {
    return c.json({ error: 'Invalid path' }, 400);
  }

  // Validate path belongs to this user & motive (format: motiveId/userId/file)
  const expectedPrefix = `${motiveId}/${me.id}/`;
  if (!path.startsWith(expectedPrefix)) {
    return c.json({ error: 'invalid path' }, 403);
  }

  if (!(await assertAttendee(motiveId, me.id))) {
    return c.json({ error: 'not an attendee' }, 403);
  }

  // Upsert the memory record -- append the new path
  const [existing] = await db
    .select({ id: motiveMemories.id, storagePaths: motiveMemories.storagePaths })
    .from(motiveMemories)
    .where(and(eq(motiveMemories.motiveId, motiveId), eq(motiveMemories.userId, me.id)))
    .limit(1);

  if (existing) {
    const newPaths = [...(existing.storagePaths ?? []), path];
    await db
      .update(motiveMemories)
      .set({ storagePaths: newPaths })
      .where(eq(motiveMemories.id, existing.id));
  } else {
    await db.insert(motiveMemories).values({
      motiveId,
      userId: me.id,
      storagePaths: [path],
      vibeTags: [],
    });
  }

  return c.json({ ok: true, path });
});

// ── GET /api/motives/:id/memories/mine ────────────────────────────────────────
// Returns the caller's own memory record with storage paths + signed read URLs.
memoriesRoutes.get('/:id/memories/mine', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');

  if (!(await assertAttendee(motiveId, me.id))) {
    return c.json({ error: 'not an attendee' }, 403);
  }

  const [row] = await db
    .select({
      vibeTags: motiveMemories.vibeTags,
      rating: motiveMemories.rating,
      venueRating: motiveMemories.venueRating,
      storagePaths: motiveMemories.storagePaths,
    })
    .from(motiveMemories)
    .where(and(eq(motiveMemories.motiveId, motiveId), eq(motiveMemories.userId, me.id)))
    .limit(1);

  if (!row) return c.json({ memory: null });

  const signedUrls = await signPaths(row.storagePaths ?? []);
  const photos = (row.storagePaths ?? []).map((path, i) => ({
    path,
    signedUrl: signedUrls[i] ?? '',
  }));

  return c.json({
    memory: {
      vibeTags: row.vibeTags ?? [],
      rating: row.rating,
      venueRating: row.venueRating,
      photos,
    },
  });
});

// -- GET /api/motives/:id/memories ---------------------------------------------
// Returns all attendees' memories with fresh signed read URLs.
memoriesRoutes.get('/:id/memories', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');

  if (!(await assertAttendee(motiveId, me.id))) {
    return c.json({ error: 'not an attendee' }, 403);
  }

  const rows = await db
    .select({
      id: motiveMemories.id,
      userId: motiveMemories.userId,
      userName: users.name,
      userImage: users.image,
      storagePaths: motiveMemories.storagePaths,
      vibeTags: motiveMemories.vibeTags,
      rating: motiveMemories.rating,
      venueRating: motiveMemories.venueRating,
      createdAt: motiveMemories.createdAt,
    })
    .from(motiveMemories)
    .leftJoin(users, eq(motiveMemories.userId, users.id))
    .where(eq(motiveMemories.motiveId, motiveId));

  // Sign all paths concurrently per user
  const memories = await Promise.all(
    rows.map(async (row) => {
      const signedUrls = await signPaths(row.storagePaths ?? []);
      return {
        userId: row.userId,
        userName: row.userName,
        userImage: row.userImage,
        photos: signedUrls,
        vibeTags: row.vibeTags ?? [],
        rating: row.rating,
        venueRating: row.venueRating,
        createdAt: row.createdAt,
        isMe: row.userId === me.id,
      };
    }),
  );

  return c.json({ memories });
});

// -- DELETE /api/motives/:id/memories/:encodedPath -----------------------------
// Deletes one of the caller's own photos.
memoriesRoutes.delete('/:id/memories/:encodedPath', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');
  const path = decodeURIComponent(c.req.param('encodedPath'));

  // Reject path traversal sequences and excessive length
  if (path.includes('..') || path.includes('//')) {
    return c.json({ error: 'Invalid path' }, 400);
  }
  if (path.length > 500) {
    return c.json({ error: 'Invalid path' }, 400);
  }

  // Must start with motiveId/userId/
  if (!path.startsWith(`${motiveId}/${me.id}/`)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  // Delete from storage
  const { error } = await supabaseAdmin.storage.from(MEMORIES_BUCKET).remove([path]);
  if (error) {
    console.error('[memories] delete error:', error);
    return c.json({ error: 'delete failed' }, 500);
  }

  // Remove from DB record
  const [existing] = await db
    .select({ id: motiveMemories.id, storagePaths: motiveMemories.storagePaths })
    .from(motiveMemories)
    .where(and(eq(motiveMemories.motiveId, motiveId), eq(motiveMemories.userId, me.id)))
    .limit(1);

  if (existing) {
    const newPaths = (existing.storagePaths ?? []).filter((p) => p !== path);
    await db
      .update(motiveMemories)
      .set({ storagePaths: newPaths })
      .where(eq(motiveMemories.id, existing.id));
  }

  return c.json({ ok: true });
});

// -- PATCH /api/motives/:id/memories -- save vibe tags + ratings ---------------
memoriesRoutes.patch('/:id/memories', async (c) => {
  const me = c.get('user')!;
  const motiveId = c.req.param('id');
  const { vibeTags, rating, venueRating } = await c.req.json<{
    vibeTags?: string[];
    rating?: number;
    venueRating?: number;
  }>();

  if (!(await assertAttendee(motiveId, me.id))) {
    return c.json({ error: 'not an attendee' }, 403);
  }

  const updates: Record<string, unknown> = {};
  if (vibeTags !== undefined) updates.vibeTags = vibeTags;
  if (rating !== undefined) updates.rating = rating;
  if (venueRating !== undefined) updates.venueRating = venueRating;

  const [existing] = await db
    .select({ id: motiveMemories.id })
    .from(motiveMemories)
    .where(and(eq(motiveMemories.motiveId, motiveId), eq(motiveMemories.userId, me.id)))
    .limit(1);

  if (existing) {
    await db.update(motiveMemories).set(updates).where(eq(motiveMemories.id, existing.id));
  } else {
    await db.insert(motiveMemories).values({
      motiveId, userId: me.id, storagePaths: [], vibeTags: vibeTags ?? [], rating, venueRating,
    });
  }

  return c.json({ ok: true });
});
