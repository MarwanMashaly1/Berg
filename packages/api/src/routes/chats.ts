import { Hono } from 'hono';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import {
  chats,
  chatMembers,
  messages,
  users,
} from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import { sendPushBatch } from '../lib/notifications.js';
import { supabaseAdmin, CHAT_IMAGES_BUCKET } from '../lib/supabase-admin.js';
import { rateLimiter, API_LIMITS } from '../lib/rate-limiter.js';
import type { auth } from '../auth.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const chatsRoutes = new Hono<{ Variables: Variables }>();
chatsRoutes.use('*', requireAuth);

// â”€â”€ Helper: assert caller is a member of the chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function assertMember(chatId: string, userId: string) {
  const [row] = await db
    .select({ chatId: chatMembers.chatId })
    .from(chatMembers)
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
    .limit(1);
  return !!row;
}

// â”€â”€ GET /api/chats â€” list all chats for current user â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
chatsRoutes.get('/', async (c) => {
  const me = c.get('user')!;

  // All chats the user belongs to
  const memberRows = await db
    .select({ chatId: chatMembers.chatId, lastReadAt: chatMembers.lastReadAt })
    .from(chatMembers)
    .where(eq(chatMembers.userId, me.id));

  if (memberRows.length === 0) return c.json({ chats: [] });

  const chatIds = memberRows.map((r) => r.chatId);
  const lastReadMap = new Map(memberRows.map((r) => [r.chatId, r.lastReadAt]));

  // Fetch chat metadata
  const chatRows = await db
    .select()
    .from(chats)
    .where(inArray(chats.id, chatIds));

  // Latest message per chat + unread count
  const enriched = await Promise.all(
    chatRows.map(async (chat) => {
      const [lastMsg] = await db
        .select({
          id: messages.id,
          content: messages.content,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
          senderName: users.name,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const lastRead = lastReadMap.get(chat.id);
      const [{ unread }] = await db
        .select({ unread: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chat.id),
            sql`${messages.senderId} != ${me.id}`,
            lastRead
              ? sql`${messages.createdAt} > ${lastRead.toISOString()}::timestamptz`
              : undefined,
          ),
        );

      // Member previews (up to 3 other members)
      const memberPreviews = await db
        .select({ id: users.id, name: users.name, image: users.image })
        .from(chatMembers)
        .leftJoin(users, eq(chatMembers.userId, users.id))
        .where(and(eq(chatMembers.chatId, chat.id), sql`${chatMembers.userId} != ${me.id}`))
        .limit(3);

      return {
        id: chat.id,
        type: chat.type,
        name: chat.name,
        motiveId: chat.motiveId,
        groupCircleId: chat.groupCircleId,
        createdAt: chat.createdAt,
        lastMessage: lastMsg ?? null,
        unreadCount: unread ?? 0,
        memberPreviews,
      };
    }),
  );

  // Sort by latest message descending
  enriched.sort((a, b) => {
    const ta = a.lastMessage?.createdAt?.getTime() ?? a.createdAt.getTime();
    const tb = b.lastMessage?.createdAt?.getTime() ?? b.createdAt.getTime();
    return tb - ta;
  });

  return c.json({ chats: enriched });
});

// â”€â”€ POST /api/chats/groups â€” create a personal group chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MUST be registered before /:id routes
chatsRoutes.post('/groups', async (c) => {
  const me = c.get('user')!;
  const { name, memberIds = [] } = await c.req.json<{ name: string; memberIds: string[] }>();

  if (!name?.trim()) return c.json({ error: 'name is required' }, 400);

  const allIds = Array.from(new Set([me.id, ...memberIds]));

  const [chat] = await db
    .insert(chats)
    .values({ type: 'group', name: name.trim() })
    .returning({ id: chats.id });

  await db.insert(chatMembers).values(
    allIds.map((uid) => ({ chatId: chat.id, userId: uid })),
  );

  return c.json({ id: chat.id }, 201);
});

// â”€â”€ GET /api/chats/:id â€” chat info + members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ GET /api/chats/:id/messages â€” paginated messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
chatsRoutes.get('/:id/messages', async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');
  const before = c.req.query('before'); // ISO timestamp cursor
  const limit = Math.min(Number(c.req.query('limit') ?? 40), 100);

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
        before ? sql`${messages.createdAt} < ${new Date(before)}` : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  // Mark as read
  await db
    .update(chatMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, me.id)));

  return c.json({ messages: rows.reverse(), hasMore: rows.length === limit });
});

// â”€â”€ POST /api/chats/:id/messages â€” send a message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
chatsRoutes.post('/:id/messages', async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');

  // Rate limit: 60 messages per user per minute
  const rl = rateLimiter.check(
    `${me.id}:chat-message`,
    API_LIMITS.chatMessage.limit,
    API_LIMITS.chatMessage.windowMs,
  );
  if (!rl.allowed) {
    c.header('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return c.json({ error: 'Too many requests. Try again shortly.' }, 429);
  }

  const { content, type = 'text', metadata } = await c.req.json<{
    content: string;
    type?: string;
    metadata?: Record<string, unknown>;
  }>();

  const allowedTypes = ['text', 'image', 'gif'];
  if (!allowedTypes.includes(type)) return c.json({ error: 'invalid message type' }, 400);
  if (!content || typeof content !== 'string' || content.length === 0) {
    return c.json({ error: 'content is required' }, 400);
  }
  if (content.length > 4000) {
    return c.json({ error: 'Message too long (max 4000 characters)' }, 400);
  }
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

  // N7 â€” New chat message push to all other members
  if (type !== 'system') {
    const [allMembers, chatRow] = await Promise.all([
      db.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.chatId, chatId)),
      db.select({ type: chats.type, name: chats.name }).from(chats).where(eq(chats.id, chatId)).limit(1),
    ]);
    const otherMembers = allMembers.filter((m) => m.userId !== me.id).map((m) => m.userId);
    if (otherMembers.length > 0 && chatRow[0]) {
      const chat = chatRow[0];
      const preview = content.length > 60 ? content.slice(0, 57) + 'â€¦' : content;
      const isGroup = chat.type === 'group';
      void sendPushBatch(otherMembers, {
        title: isGroup ? (chat.name ?? 'Group') : (me.name ?? 'Someone'),
        body: isGroup ? `${me.name ?? 'Someone'}: ${preview}` : preview,
        data: { screen: 'chat', chatId },
      }).catch(() => {});
    }
  }

  return c.json({ message: { ...msg, senderName: me.name, senderImage: me.image } }, 201);
});

// â”€â”€ PATCH /api/chats/:id â€” rename a group chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
chatsRoutes.patch('/:id', async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');
  const { name } = await c.req.json<{ name: string }>();

  if (!name?.trim()) return c.json({ error: 'name is required' }, 400);

  if (!(await assertMember(chatId, me.id))) {
    return c.json({ error: 'not a member' }, 403);
  }

  const [chat] = await db.select({ type: chats.type }).from(chats).where(eq(chats.id, chatId)).limit(1);
  if (!chat || chat.type !== 'group') return c.json({ error: 'only group chats can be renamed' }, 400);

  await db.update(chats).set({ name: name.trim() }).where(eq(chats.id, chatId));
  return c.json({ ok: true, name: name.trim() });
});

// â”€â”€ POST /api/chats/:id/upload-url â€” signed URL for a chat image â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
chatsRoutes.post('/:id/upload-url', async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');
  const { contentType = 'image/jpeg', ext = 'jpg' } = await c.req.json<{
    contentType?: string;
    ext?: string;
  }>();

  if (!(await assertMember(chatId, me.id))) {
    return c.json({ error: 'not a member' }, 403);
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
  if (!allowed.includes(contentType)) return c.json({ error: 'unsupported type' }, 400);

  const fileId = randomUUID();
  const path = `${chatId}/${fileId}.${ext.replace(/[^a-z0-9]/gi, '')}`;

  // chat-images is a PUBLIC bucket â€” getPublicUrl gives a permanent link
  const { data, error } = await supabaseAdmin.storage
    .from(CHAT_IMAGES_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error('[chats] createSignedUploadUrl error:', JSON.stringify(error));
    return c.json({ error: `could not create upload URL: ${error?.message ?? 'unknown'}` }, 500);
  }

  // Public URL is permanent â€” store it directly as message content
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(CHAT_IMAGES_BUCKET)
    .getPublicUrl(path);

  return c.json({ uploadUrl: data.signedUrl, token: data.token, path, publicUrl });
});

// â”€â”€ POST /api/chats/:id/members â€” add members to a group chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
chatsRoutes.post('/:id/members', async (c) => {
  const me = c.get('user')!;
  const chatId = c.req.param('id');
  const { userIds = [] } = await c.req.json<{ userIds: string[] }>();

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
