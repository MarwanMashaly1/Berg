import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import {
  chats,
  chatMembers,
  messages,
  users,
  circles,
  notificationInbox,
} from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import { debouncedChatPush } from '../lib/notifications.js';
import { supabaseAdmin, CHAT_IMAGES_BUCKET } from '../lib/supabase-admin.js';
import { rateLimiter, rateLimit, API_LIMITS } from '../lib/rate-limiter.js';
import { cache, TTL, CK } from '../lib/cache.js';
import type { auth } from '../auth.js';
import { log } from '../lib/logger.js';
import { reportAndReturn500 } from '../lib/errors.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  memberIds: z.array(z.string()).default([]),
});

const createDirectSchema = z.object({
  userId: z.string().min(1),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  type: z.enum(['text', 'image', 'gif']).default('text'),
  metadata: z.record(z.unknown()).optional(),
});

const renameGroupSchema = z.object({
  name: z.string().min(1).max(100),
});

const uploadUrlSchema = z.object({
  contentType: z.string().default('image/jpeg'),
  ext: z.string().default('jpg'),
});

const addMembersSchema = z.object({
  userIds: z.array(z.string()).default([]),
});

export const chatsRoutes = new Hono<{ Variables: Variables }>();
chatsRoutes.use('*', requireAuth);

// -- Helper: assert caller is a member of the chat ----------------------------
async function assertMember(chatId: string, userId: string) {
  const [row] = await db
    .select({ chatId: chatMembers.chatId })
    .from(chatMembers)
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
    .limit(1);
  return !!row;
}

// -- GET /api/chats -- list all chats for current user -------------------------
chatsRoutes.get('/', async (c) => {
  const me = c.get('user')!;

  const cached = cache.get<{ chats: unknown[] }>(CK.chatList(me.id));
  if (cached) {
    c.header('X-Cache', 'HIT');
    return c.json(cached);
  }

  try {
  // All chats the user belongs to
  const memberRows = await db
    .select({ chatId: chatMembers.chatId })
    .from(chatMembers)
    .where(eq(chatMembers.userId, me.id));

  if (memberRows.length === 0) return c.json({ chats: [] });

  const chatIds = memberRows.map((r) => r.chatId);

  // Fetch chat metadata
  const chatRows = await db
    .select()
    .from(chats)
    .where(inArray(chats.id, chatIds));

  if (chatRows.length === 0) return c.json({ chats: [] });

  // Bulk fetch: last message per chat, unread counts, member previews — 3 queries total
  const chatIdList = sql.join(chatIds.map((id) => sql`${id}::uuid`), sql`, `);

  type LastMsgRow = { chatId: string; id: string; content: string; senderId: string; createdAt: Date; senderName: string | null };
  type UnreadRow  = { chatId: string; unread: number };

  const [lastMsgsResult, unreadResult, allMemberPreviews] = await Promise.all([
    db.execute(sql`
      SELECT DISTINCT ON (m.chat_id)
        m.chat_id::text   AS "chatId",
        m.id::text        AS id,
        m.content,
        m.sender_id::text AS "senderId",
        m.created_at      AS "createdAt",
        u.name            AS "senderName"
      FROM ${messages} m
      LEFT JOIN ${users} u ON m.sender_id = u.id
      WHERE m.chat_id IN (${chatIdList})
      ORDER BY m.chat_id, m.created_at DESC
    `),
    db.execute(sql`
      SELECT m.chat_id::text AS "chatId", COUNT(*)::int AS unread
      FROM ${messages} m
      JOIN ${chatMembers} cm
        ON cm.chat_id = m.chat_id AND cm.user_id = ${me.id}
      WHERE m.chat_id IN (${chatIdList})
        AND m.sender_id != ${me.id}
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
      GROUP BY m.chat_id
    `),
    db
      .select({ chatId: chatMembers.chatId, id: users.id, name: users.name, image: users.image })
      .from(chatMembers)
      .leftJoin(users, eq(chatMembers.userId, users.id))
      .where(and(inArray(chatMembers.chatId, chatIds), sql`${chatMembers.userId} != ${me.id}`)),
  ]);

  const lastMsgMap = new Map(
    (lastMsgsResult as unknown as LastMsgRow[]).map((r) => [r.chatId, r]),
  );
  const unreadMap = new Map(
    (unreadResult as unknown as UnreadRow[]).map((r) => [r.chatId, Number(r.unread)]),
  );
  const memberPreviewMap = new Map<string, typeof allMemberPreviews>();
  for (const m of allMemberPreviews) {
    const list = memberPreviewMap.get(m.chatId) ?? [];
    if (list.length < 3) {
      list.push(m);
      memberPreviewMap.set(m.chatId, list);
    }
  }

  const enriched = chatRows.map((chat) => {
    const lastMsgRow = lastMsgMap.get(chat.id);
    return {
      id: chat.id,
      type: chat.type,
      name: chat.name,
      motiveId: chat.motiveId,
      groupCircleId: chat.groupCircleId,
      createdAt: chat.createdAt,
      lastMessage: lastMsgRow
        ? {
            id: lastMsgRow.id,
            content: lastMsgRow.content,
            senderId: lastMsgRow.senderId,
            createdAt: new Date(lastMsgRow.createdAt),
            senderName: lastMsgRow.senderName,
          }
        : null,
      unreadCount: unreadMap.get(chat.id) ?? 0,
      memberPreviews: memberPreviewMap.get(chat.id) ?? [],
    };
  });

  // Sort by latest message descending
  enriched.sort((a, b) => {
    const ta = a.lastMessage?.createdAt?.getTime() ?? a.createdAt.getTime();
    const tb = b.lastMessage?.createdAt?.getTime() ?? b.createdAt.getTime();
    return tb - ta;
  });

  const result = { chats: enriched };
  cache.set(CK.chatList(me.id), result, TTL.CHAT_LIST);
  c.header('X-Cache', 'MISS');
  return c.json(result);
  } catch (err) {
    return reportAndReturn500(c, err, { userId: me.id });
  }
});

// -- POST /api/chats/groups -- create a personal group chat --------------------
// [align-4] Route retained for existing chats. New group creation hidden from UI per PRODUCT_NORTH_STAR.md.
// MUST be registered before /:id routes
chatsRoutes.post('/groups', zValidator('json', createGroupSchema), async (c) => {
  const me = c.get('user')!;
  const { name, memberIds } = c.req.valid('json');

  const allIds = Array.from(new Set([me.id, ...memberIds]));

  const [chat] = await db
    .insert(chats)
    .values({ type: 'group', name: name.trim() })
    .returning({ id: chats.id });

  await db.insert(chatMembers).values(
    allIds.map((uid) => ({ chatId: chat.id, userId: uid })),
  );

  for (const uid of allIds) cache.del(CK.chatList(uid));
  return c.json({ id: chat.id }, 201);
});

// -- POST /api/chats/direct -- get or create a 1-on-1 DM ----------------------
// MUST be registered before /:id routes
chatsRoutes.post('/direct', zValidator('json', createDirectSchema), async (c) => {
  const me = c.get('user')!;
  const { userId } = c.req.valid('json');

  if (userId === me.id) return c.json({ error: 'invalid userId' }, 400);

  // Verify the two users are connected
  const [conn] = await db
    .select({ id: circles.id })
    .from(circles)
    .where(
      sql`(${circles.userId} = ${me.id} AND ${circles.friendId} = ${userId})
        OR (${circles.userId} = ${userId} AND ${circles.friendId} = ${me.id})`,
    )
    .limit(1);

  if (!conn) return c.json({ error: 'not connected' }, 403);

  // Find existing direct chat between these two users
  const existing = await db.execute(sql`
    SELECT c.id FROM ${chats} c
    JOIN ${chatMembers} cm1 ON cm1.chat_id = c.id AND cm1.user_id = ${me.id}
    JOIN ${chatMembers} cm2 ON cm2.chat_id = c.id AND cm2.user_id = ${userId}
    WHERE c.type = 'direct'
    LIMIT 1
  `);

  if (existing.length > 0) {
    const row = existing[0] as { id: string };
    return c.json({ id: row.id, isNew: false });
  }

  // Create new direct chat
  const [chat] = await db
    .insert(chats)
    .values({ type: 'direct', name: null })
    .returning({ id: chats.id });

  await db.insert(chatMembers).values([
    { chatId: chat.id, userId: me.id },
    { chatId: chat.id, userId },
  ]);

  cache.del(CK.chatList(me.id));
  cache.del(CK.chatList(userId));
  return c.json({ id: chat.id, isNew: true }, 201);
});

// -- GET /api/chats/:id -- chat info + members ---------------------------------
chatsRoutes.get('/:id', async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');

  if (!(await assertMember(chatId, me.id))) {
    return c.json({ error: 'not a member' }, 403);
  }

  const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  if (!chat) return c.json({ error: 'not found' }, 404);

  const members = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(chatMembers)
    .leftJoin(users, eq(chatMembers.userId, users.id))
    .where(eq(chatMembers.chatId, chatId));

  return c.json({ chat, members });
});

// -- GET /api/chats/:id/messages -- paginated messages -------------------------
chatsRoutes.get('/:id/messages', async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');
  const beforeRaw = c.req.query('before'); // ISO timestamp cursor
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
  if (beforeDate && isNaN(beforeDate.getTime())) {
    return c.json({ error: 'invalid before cursor' }, 400);
  }
  const limit = Math.max(1, Math.min(Number(c.req.query('limit') ?? 40), 100));

  if (!(await assertMember(chatId, me.id))) {
    return c.json({ error: 'not a member' }, 403);
  }

  const rows = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      senderId: messages.senderId,
      content: messages.content,
      type: messages.type,
      metadata: messages.metadata,
      createdAt: messages.createdAt,
      senderName: users.name,
      senderImage: users.image,
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(
      and(
        eq(messages.chatId, chatId),
        beforeDate ? sql`${messages.createdAt} < ${beforeDate}` : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  // Mark chat as read + dismiss inbox notifications for this chat
  await Promise.all([
    db.update(chatMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, me.id))),
    db.update(notificationInbox)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationInbox.userId, me.id),
          sql`${notificationInbox.data}::jsonb->>'chatId' = ${chatId}`,
          sql`${notificationInbox.readAt} IS NULL`,
        ),
      ),
  ]);

  return c.json({ messages: rows.reverse(), hasMore: rows.length === limit });
});

// -- POST /api/chats/:id/messages -- send a message ----------------------------
chatsRoutes.post('/:id/messages', zValidator('json', sendMessageSchema), async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');

  // Rate limit: 60 messages per user per minute
  const limited = rateLimit(c, `${me.id}:chat-message`, API_LIMITS.chatMessage.limit, API_LIMITS.chatMessage.windowMs);
  if (limited) return limited;

  const { content, type, metadata } = c.req.valid('json');

  // images/gifs: content is a URL so don't trim; text: must be non-empty after trim
  if (type === 'text' && !content.trim()) return c.json({ error: 'content is required' }, 400);

  if (!(await assertMember(chatId, me.id))) {
    return c.json({ error: 'not a member' }, 403);
  }

  const [msg] = await db
    .insert(messages)
    .values({
      chatId,
      senderId: me.id,
      content: content.trim(),
      type,
      metadata: metadata ?? null,
    })
    .returning();

  // Update caller's lastReadAt
  await db
    .update(chatMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, me.id)));

  cache.del(CK.chatList(me.id));

  // N7 -- New chat message push to all other members
  if (type !== 'system') {
    const [allMembers, chatRow] = await Promise.all([
      db.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.chatId, chatId)),
      db.select({ type: chats.type, name: chats.name }).from(chats).where(eq(chats.id, chatId)).limit(1),
    ]);
    const otherMembers = allMembers.filter((m) => m.userId !== me.id).map((m) => m.userId);
    for (const uid of otherMembers) cache.del(CK.chatList(uid));
    if (otherMembers.length > 0 && chatRow[0]) {
      const chat = chatRow[0];
      const preview = content.length > 60 ? content.slice(0, 57) + '...' : content;
      const isGroup = chat.type === 'group';
      void debouncedChatPush(chatId, otherMembers, {
        title: isGroup ? (chat.name ?? 'Group') : (me.name ?? 'Someone'),
        body: isGroup ? `${me.name ?? 'Someone'}: ${preview}` : preview,
        data: { screen: 'chat', chatId },
      }).catch((err) => log.error({ err, chatId }, 'chats push failed'));
    }
  }

  return c.json({ message: { ...msg, senderName: me.name, senderImage: me.image } }, 201);
});

// -- PATCH /api/chats/:id -- rename a group chat -------------------------------
chatsRoutes.patch('/:id', zValidator('json', renameGroupSchema), async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');
  const { name } = c.req.valid('json');

  if (!(await assertMember(chatId, me.id))) {
    return c.json({ error: 'not a member' }, 403);
  }

  const [chat] = await db.select({ type: chats.type }).from(chats).where(eq(chats.id, chatId)).limit(1);
  if (!chat || chat.type !== 'group') return c.json({ error: 'only group chats can be renamed' }, 400);

  await db.update(chats).set({ name: name.trim() }).where(eq(chats.id, chatId));
  return c.json({ ok: true, name: name.trim() });
});

// -- POST /api/chats/:id/upload-url -- signed URL for a chat image -------------
chatsRoutes.post('/:id/upload-url', zValidator('json', uploadUrlSchema), async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');
  const { contentType, ext } = c.req.valid('json');

  if (!(await assertMember(chatId, me.id))) {
    return c.json({ error: 'not a member' }, 403);
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
  if (!allowed.includes(contentType)) return c.json({ error: 'unsupported type' }, 400);

  const fileId = randomUUID();
  const path = `${chatId}/${fileId}.${ext.replace(/[^a-z0-9]/gi, '')}`;

  // chat-images is a PUBLIC bucket -- getPublicUrl gives a permanent link
  const { data, error } = await supabaseAdmin.storage
    .from(CHAT_IMAGES_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    log.error({ err: error, chatId }, 'chats upload URL creation failed');
    return c.json({ error: `could not create upload URL: ${error?.message ?? 'unknown'}` }, 500);
  }

  // Public URL is permanent -- store it directly as message content
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(CHAT_IMAGES_BUCKET)
    .getPublicUrl(path);

  return c.json({ uploadUrl: data.signedUrl, token: data.token, path, publicUrl });
});

// -- POST /api/chats/:id/members -- add members to a group chat ----------------
chatsRoutes.post('/:id/members', zValidator('json', addMembersSchema), async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');
  const { userIds } = c.req.valid('json');

  if (!(await assertMember(chatId, me.id))) {
    return c.json({ error: 'not a member' }, 403);
  }

  const [chat] = await db.select({ type: chats.type }).from(chats).where(eq(chats.id, chatId)).limit(1);
  if (!chat || chat.type !== 'group') return c.json({ error: 'can only add members to group chats' }, 400);

  if (userIds.length > 0) {
    await db
      .insert(chatMembers)
      .values(userIds.map((uid) => ({ chatId, userId: uid })))
      .onConflictDoNothing();
  }

  return c.json({ ok: true });
});
