import { Hono } from 'hono';
import { eq, and, count, sql } from 'drizzle-orm';
import { randomUUID, randomBytes } from 'crypto';
import { fileTypeFromBuffer } from 'file-type';
import { db } from '../db.js';
import {
  circles, users,
  groupCircles, groupCircleMembers, chats, chatMembers,
} from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import { sendPush, filterByPreference } from '../lib/notifications.js';
import { enqueue } from '../lib/queue.js';
import { rateLimit, API_LIMITS } from '../lib/rate-limiter.js';
import { cache, CK } from '../lib/cache.js';
import { supabaseAdmin, CIRCLE_IMAGES_BUCKET } from '../lib/supabase-admin.js';
import type { auth } from '../auth.js';
import { log } from '../lib/logger.js';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const createCircleSchema = z.object({
  name: z.string().min(1, 'Circle name is required'),
  description: z.string().optional(),
  categoryEmoji: z.string().optional(),
  categoryColor: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});
const updateCircleSchema = createCircleSchema.partial();

export const circlesRoutes = new Hono<{ Variables: Variables }>();
circlesRoutes.use('*', requireAuth);

// POST /api/circles -- Create a new group circle
circlesRoutes.post('/', zValidator('json', createCircleSchema), async (c) => {
  const me = c.get('user')!;
  const body = c.req.valid('json');

  try {
    // Generate a unique 6-char alphanumeric join code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const makeCode = () =>
      Array.from(randomBytes(6)).map(b => chars[b % chars.length]).join('');

    let joinCode = makeCode();
    const existing = await db
      .select({ id: groupCircles.id })
      .from(groupCircles)
      .where(eq(groupCircles.joinCode, joinCode))
      .limit(1);
    if (existing.length > 0) joinCode = makeCode();

    const [circle] = await db
      .insert(groupCircles)
      .values({
        id: randomUUID(),
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        adminUserId: me.id,
        joinCode,
        requiresApproval: body.requiresApproval ?? false,
        isPublic: body.isPublic ?? true,
        categoryEmoji: body.categoryEmoji ?? '👥',
        categoryColor: body.categoryColor ?? '#e8f0fe',
        createdAt: new Date(),
      })
      .returning({ id: groupCircles.id, joinCode: groupCircles.joinCode });

    // Add creator as active member
    await db.insert(groupCircleMembers).values({
      groupCircleId: circle.id,
      userId: me.id,
      status: 'active',
      joinedAt: new Date(),
    });

    // Auto-create a group chat for this circle -- every circle gets a chat
    const [chat] = await db
      .insert(chats)
      .values({
        id: randomUUID(),
        type: 'group',
        name: body.name!.trim(),
        groupCircleId: circle.id,
        createdAt: new Date(),
      })
      .returning({ id: chats.id });

    // Add creator as chat member
    await db.insert(chatMembers).values({
      chatId: chat.id,
      userId: me.id,
      joinedAt: new Date(),
    });

    // New circle is public — bust circle suggestion cache for all users so it shows up immediately
    cache.delPrefix('circles:suggest:');
    cache.del(CK.profileCircles(me.id));
    cache.del(CK.chatList(me.id));

    return c.json({ id: circle.id, joinCode: circle.joinCode, chatId: chat.id }, 201);
  } catch (err) {
    log.error({ err, userId: me.id }, 'circles create failed');
    return c.json({ error: 'Failed to create circle. Please try again.' }, 500);
  }
});

circlesRoutes.post('/:id/join', async (c) => {
  const me = c.get('user')!;
  const circleId = c.req.param('id');

  const [circle] = await db
    .select()
    .from(groupCircles)
    .where(eq(groupCircles.id, circleId))
    .limit(1);

  if (!circle) return c.json({ error: 'Circle not found' }, 404);

  const status = circle.requiresApproval ? 'pending' : 'active';

  await db
    .insert(groupCircleMembers)
    .values({ groupCircleId: circleId, userId: me.id, status, joinedAt: new Date() })
    .onConflictDoNothing();

  // N5 -- Circle join request push to admin (only when approval is required)
  if (circle.requiresApproval) {
    const eligible = await filterByPreference([circle.adminUserId], 'notifyCircleRequests');
    if (eligible.length > 0) {
      void sendPush(circle.adminUserId, {
        title: circle.name,
        body: `${me.name ?? 'Someone'} wants to join`,
        data: { screen: 'circle', circleId },
      }).catch((err) => log.error({ err, circleId, userId: me.id }, 'discovery circle join push failed'));
    }
  }

  let chatId: string | null = null;
  if (status === 'active') {
    // Look up the circle's group chat by groupCircleId (reliable) not by name (fragile)
    const [existingChat] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.type, 'group'), eq(chats.groupCircleId, circleId)))
      .limit(1);

    if (existingChat) {
      // Chat already exists -- add the new member, marking all prior messages as read
      chatId = existingChat.id;
      const now = new Date();
      await db
        .insert(chatMembers)
        .values({ chatId, userId: me.id, joinedAt: now, lastReadAt: now })
        .onConflictDoNothing();
    } else {
      // No chat yet -- create one and add ALL current active members
      const [newChat] = await db
        .insert(chats)
        .values({
          id: randomUUID(),
          type: 'group',
          name: circle.name,
          groupCircleId: circleId,
          createdAt: new Date(),
        })
        .returning({ id: chats.id });

      const activeMembers = await db
        .select({ userId: groupCircleMembers.userId })
        .from(groupCircleMembers)
        .where(and(eq(groupCircleMembers.groupCircleId, circleId), eq(groupCircleMembers.status, 'active')));

      if (activeMembers.length > 0) {
        const now = new Date();
        await db
          .insert(chatMembers)
          .values(activeMembers.map(m => ({ chatId: newChat.id, userId: m.userId, joinedAt: now, lastReadAt: now })))
          .onConflictDoNothing();
      }

      chatId = newChat.id;
    }
  }

  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(groupCircleMembers)
    .where(and(
      eq(groupCircleMembers.groupCircleId, circleId),
      eq(groupCircleMembers.status, 'active')
    ));

  // Invalidate circle suggestions and stats for this user
  cache.del(CK.circles(me.id));
  cache.del(CK.profileCircles(me.id));
  if (status === 'active') {
    cache.del(CK.stats(me.id));
    cache.del(CK.chatList(me.id));
  }

  return c.json({ ok: true, status, memberCount, chatId });
});

// POST /api/circles/request/:userId
circlesRoutes.post('/request/:userId', async (c) => {
  const me = c.get('user')!;
  const targetId = c.req.param('userId');
  if (targetId === me.id) return c.json({ error: 'Cannot connect with yourself' }, 400);

  // Rate limit: 30 connection requests per user per hour
  const limited = rateLimit(c, `${me.id}:connection-request`, API_LIMITS.connectionRequest.limit, API_LIMITS.connectionRequest.windowMs);
  if (limited) return limited;
  await db.insert(circles).values({
    id: randomUUID(), userId: me.id, friendId: targetId, status: 'pending', createdAt: new Date(),
  }).onConflictDoNothing();

  // N3 -- Connection request push
  const eligible = await filterByPreference([targetId], 'notifyCircleRequests');
  if (eligible.length > 0) {
    void sendPush(targetId, {
      title: me.name ?? 'Someone',
      body: 'wants to connect with you',
      data: { screen: 'connections' },
    }).catch((err) => log.error({ err, targetId, userId: me.id }, 'discovery connection request push failed'));
  }

  return c.json({ ok: true });
});

// POST /api/circles/accept/:userId
circlesRoutes.post('/accept/:userId', async (c) => {
  const me = c.get('user')!;
  const requesterId = c.req.param('userId');
  await db.delete(circles).where(and(eq(circles.userId, requesterId), eq(circles.friendId, me.id), eq(circles.status, 'pending')));
  await db.insert(circles).values([
    { id: randomUUID(), userId: me.id, friendId: requesterId, status: 'confirmed', createdAt: new Date() },
    { id: randomUUID(), userId: requesterId, friendId: me.id, status: 'confirmed', createdAt: new Date() },
  ]).onConflictDoNothing();

  // N4 -- Connection accepted push to the requester
  const eligible = await filterByPreference([requesterId], 'notifyCircleRequests');
  if (eligible.length > 0) {
    void sendPush(requesterId, {
      title: me.name ?? 'Someone',
      body: 'accepted your connection request',
      data: { screen: 'connections' },
    }).catch((err) => log.error({ err, requesterId, userId: me.id }, 'discovery accept push failed'));
  }

  // Recompute FOF suggestions for both users -- new connection changes the graph
  void Promise.all([
    enqueue('discovery/recompute-fof-user', { userId: me.id }),
    enqueue('discovery/recompute-fof-user', { userId: requesterId }),
  ]).catch((err) => log.error({ err, userId: me.id, requesterId }, 'discovery FOF recompute enqueue failed'));

  // Invalidate cached suggestions and stats for both users immediately
  cache.del(CK.fof(me.id));
  cache.del(CK.fof(requesterId));
  cache.del(CK.stats(me.id));
  cache.del(CK.stats(requesterId));
  cache.del(CK.connections(me.id));
  cache.del(CK.connections(requesterId));

  return c.json({ ok: true });
});

// DELETE /api/circles/disconnect/:userId -- remove a confirmed connection
circlesRoutes.delete('/disconnect/:userId', async (c) => {
  const me = c.get('user')!;
  const targetId = c.req.param('userId');
  await db.delete(circles).where(
    sql`(${circles.userId} = ${me.id} AND ${circles.friendId} = ${targetId})
      OR (${circles.userId} = ${targetId} AND ${circles.friendId} = ${me.id})`,
  );
  cache.del(CK.stats(me.id));
  cache.del(CK.stats(targetId));
  cache.del(CK.connections(me.id));
  cache.del(CK.connections(targetId));
  return c.json({ ok: true });
});

// DELETE /api/circles/decline/:userId
circlesRoutes.delete('/decline/:userId', async (c) => {
  const me = c.get('user')!;
  const requesterId = c.req.param('userId');
  await db.delete(circles).where(and(eq(circles.userId, requesterId), eq(circles.friendId, me.id), eq(circles.status, 'pending')));
  cache.del(CK.connections(me.id));
  return c.json({ ok: true });
});

// DELETE /api/circles/cancel/:userId -- cancel a request I sent
circlesRoutes.delete('/cancel/:userId', async (c) => {
  const me = c.get('user')!;
  const targetId = c.req.param('userId');
  await db.delete(circles).where(
    and(eq(circles.userId, me.id), eq(circles.friendId, targetId), eq(circles.status, 'pending')),
  );
  cache.del(CK.connections(me.id));
  return c.json({ ok: true });
});

// GET /api/circles/:id -- circle detail (UUID regex prevents collision with /by-code/:code)
circlesRoutes.get('/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}', async (c) => {
  const me = c.get('user')!;
  const circleId = c.req.param('id');

  const [circle] = await db
    .select()
    .from(groupCircles)
    .where(eq(groupCircles.id, circleId))
    .limit(1);

  if (!circle) return c.json({ error: 'Circle not found' }, 404);

  const isAdmin = circle.adminUserId === me.id;

  // My membership status
  const [myMembership] = await db
    .select({ status: groupCircleMembers.status })
    .from(groupCircleMembers)
    .where(and(eq(groupCircleMembers.groupCircleId, circleId), eq(groupCircleMembers.userId, me.id)))
    .limit(1);

  const myStatus = myMembership?.status ?? null;

  // Active members with profile info
  const memberRows = await db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      username: users.username,
    })
    .from(groupCircleMembers)
    .innerJoin(users, eq(users.id, groupCircleMembers.userId))
    .where(and(eq(groupCircleMembers.groupCircleId, circleId), eq(groupCircleMembers.status, 'active')));

  // Pending members (admin only)
  const pendingRows = isAdmin
    ? await db
        .select({
          id: users.id,
          name: users.name,
          image: users.image,
          username: users.username,
        })
        .from(groupCircleMembers)
        .innerJoin(users, eq(users.id, groupCircleMembers.userId))
        .where(and(eq(groupCircleMembers.groupCircleId, circleId), eq(groupCircleMembers.status, 'pending')))
    : [];

  return c.json({
    circle: {
      id: circle.id,
      name: circle.name,
      description: circle.description,
      adminUserId: circle.adminUserId,
      joinCode: circle.joinCode,
      requiresApproval: circle.requiresApproval,
      isPublic: circle.isPublic,
      categoryEmoji: circle.categoryEmoji,
      categoryColor: circle.categoryColor,
      coverImage: circle.coverImage,
    },
    members: memberRows,
    pendingMembers: pendingRows,
    memberCount: memberRows.length,
    isAdmin,
    myStatus,
  });
});

// PATCH /api/circles/:id -- admin-only: update name/description/emoji/color/privacy
circlesRoutes.patch('/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}', zValidator('json', updateCircleSchema), async (c) => {
  const me = c.get('user')!;
  const circleId = c.req.param('id');
  const body = c.req.valid('json');

  const [circle] = await db.select({ adminUserId: groupCircles.adminUserId })
    .from(groupCircles).where(eq(groupCircles.id, circleId)).limit(1);
  if (!circle) return c.json({ error: 'Circle not found' }, 404);
  if (circle.adminUserId !== me.id) return c.json({ error: 'Not the admin' }, 403);

  const updates: Partial<typeof groupCircles.$inferInsert> = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.categoryEmoji) updates.categoryEmoji = body.categoryEmoji;
  if (body.categoryColor) updates.categoryColor = body.categoryColor;
  if (body.requiresApproval !== undefined) updates.requiresApproval = body.requiresApproval;
  if (body.isPublic !== undefined) updates.isPublic = body.isPublic;

  await db.update(groupCircles).set(updates).where(eq(groupCircles.id, circleId));

  // If privacy changed to public, bust suggestion cache for all users
  if (body.isPublic === true) cache.delPrefix('circles:suggest:');

  return c.json({ ok: true });
});

// POST /api/circles/:id/image -- admin-only: upload cover image
circlesRoutes.post('/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}/image', async (c) => {
  const me = c.get('user')!;
  const circleId = c.req.param('id');

  const [circle] = await db.select({ adminUserId: groupCircles.adminUserId })
    .from(groupCircles).where(eq(groupCircles.id, circleId)).limit(1);
  if (!circle) return c.json({ error: 'Circle not found' }, 404);
  if (circle.adminUserId !== me.id) return c.json({ error: 'Not the admin' }, 403);

  const formData = await c.req.formData();
  const file = formData.get('image') as File | null;
  if (!file) return c.json({ error: 'No image provided' }, 400);
  if (file.size > 5 * 1024 * 1024) return c.json({ error: 'Image must be under 5 MB' }, 400);

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate actual file content via magic bytes — client-supplied MIME type is untrusted
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(detected.mime)) {
    return c.json({ error: 'Invalid image format. JPEG, PNG, or WebP required.' }, 400);
  }

  const extMap: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };
  const ext = extMap[detected.mime] ?? 'jpg';
  const path = `${circleId}/cover.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(CIRCLE_IMAGES_BUCKET)
    .upload(path, buffer, { contentType: detected.mime, upsert: true });
  if (error) return c.json({ error: 'Upload failed' }, 500);

  const { data: urlData } = supabaseAdmin.storage.from(CIRCLE_IMAGES_BUCKET).getPublicUrl(path);
  const imageUrl = urlData.publicUrl;

  await db.update(groupCircles).set({ coverImage: imageUrl }).where(eq(groupCircles.id, circleId));
  return c.json({ ok: true, imageUrl });
});

// POST /api/circles/:id/approve/:userId
circlesRoutes.post('/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}/approve/:userId', async (c) => {
  const me = c.get('user')!;
  const circleId = c.req.param('id');
  const targetUserId = c.req.param('userId');

  const [circle] = await db.select({ adminUserId: groupCircles.adminUserId })
    .from(groupCircles).where(eq(groupCircles.id, circleId)).limit(1);
  if (!circle) return c.json({ error: 'Circle not found' }, 404);
  if (circle.adminUserId !== me.id) return c.json({ error: 'Not the admin' }, 403);

  await db.update(groupCircleMembers)
    .set({ status: 'active' })
    .where(and(eq(groupCircleMembers.groupCircleId, circleId), eq(groupCircleMembers.userId, targetUserId)));

  const [existingChat] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.type, 'group'), eq(chats.groupCircleId, circleId)))
    .limit(1);

  if (existingChat) {
    const now = new Date();
    await db.insert(chatMembers)
      .values({ chatId: existingChat.id, userId: targetUserId, joinedAt: now, lastReadAt: now })
      .onConflictDoNothing();
  }

  cache.del(CK.stats(targetUserId));
  cache.del(CK.profileCircles(targetUserId));
  cache.del(CK.chatList(targetUserId));
  return c.json({ ok: true });
});

// DELETE /api/circles/:id/members/:userId
circlesRoutes.delete('/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}/members/:userId', async (c) => {
  const me = c.get('user')!;
  const circleId = c.req.param('id');
  const targetUserId = c.req.param('userId');

  const [circle] = await db.select({ adminUserId: groupCircles.adminUserId })
    .from(groupCircles).where(eq(groupCircles.id, circleId)).limit(1);
  if (!circle) return c.json({ error: 'Circle not found' }, 404);
  if (circle.adminUserId !== me.id) return c.json({ error: 'Not the admin' }, 403);

  await db.delete(groupCircleMembers)
    .where(and(eq(groupCircleMembers.groupCircleId, circleId), eq(groupCircleMembers.userId, targetUserId)));

  const [existingChat] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.type, 'group'), eq(chats.groupCircleId, circleId)))
    .limit(1);

  if (existingChat) {
    await db.delete(chatMembers)
      .where(and(eq(chatMembers.chatId, existingChat.id), eq(chatMembers.userId, targetUserId)));
  }

  cache.del(CK.stats(targetUserId));
  cache.del(CK.profileCircles(targetUserId));
  cache.del(CK.chatList(targetUserId));
  return c.json({ ok: true });
});

// GET /api/circles/by-code/:code
circlesRoutes.get('/by-code/:code', async (c) => {
  const code = c.req.param('code').toUpperCase();
  const [circle] = await db.select().from(groupCircles).where(eq(groupCircles.joinCode, code)).limit(1);
  if (!circle) return c.json({ error: 'Circle not found' }, 404);
  const [{ value: memberCount }] = await db.select({ value: count() }).from(groupCircleMembers).where(and(eq(groupCircleMembers.groupCircleId, circle.id), eq(groupCircleMembers.status, 'active')));
  return c.json({ id: circle.id, name: circle.name, memberCount: Number(memberCount), requiresApproval: circle.requiresApproval });
});
