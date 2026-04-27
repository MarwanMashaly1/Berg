import { Hono } from 'hono';
import { eq, desc, count, isNull, and } from 'drizzle-orm';
import { db } from '../db.js';
import { notificationInbox } from '@berg/shared';
import { requireAuth } from '../middleware/auth.js';
import type { auth } from '../auth.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const notificationsRoutes = new Hono<{ Variables: Variables }>();
notificationsRoutes.use('*', requireAuth);

// GET /api/notifications â€” last 30 notifications, newest first
notificationsRoutes.get('/', async (c) => {
  const me = c.get('user')!;

  const rows = await db
    .select({
      id: notificationInbox.id,
      title: notificationInbox.title,
      body: notificationInbox.body,
      data: notificationInbox.data,
      readAt: notificationInbox.readAt,
      createdAt: notificationInbox.createdAt,
    })
    .from(notificationInbox)
    .where(eq(notificationInbox.userId, me.id))
    .orderBy(desc(notificationInbox.createdAt))
    .limit(30);

  return c.json({ notifications: rows });
});

// GET /api/notifications/unread-count â€” badge number
notificationsRoutes.get('/unread-count', async (c) => {
  const me = c.get('user')!;

  const [{ unread }] = await db
    .select({ unread: count() })
    .from(notificationInbox)
    .where(
      and(
        eq(notificationInbox.userId, me.id),
        isNull(notificationInbox.readAt),
      ),
    );

  return c.json({ count: unread });
});

// POST /api/notifications/read-all â€” mark all as read
notificationsRoutes.post('/read-all', async (c) => {
  const me = c.get('user')!;

  await db
    .update(notificationInbox)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationInbox.userId, me.id),
        isNull(notificationInbox.readAt),
      ),
    );

  return c.json({ ok: true });
});

// POST /api/notifications/:id/read â€” mark single notification as read
notificationsRoutes.post('/:id/read', async (c) => {
  const me = c.get('user')!;
  const { id } = c.req.param();

  await db
    .update(notificationInbox)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationInbox.id, id),
        eq(notificationInbox.userId, me.id),
      ),
    );

  return c.json({ ok: true });
});
