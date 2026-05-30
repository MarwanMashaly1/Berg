import { db } from '../db.js';
import { notificationInbox } from '@berg/shared';
import { lt } from 'drizzle-orm';
import { log } from '../lib/logger.js';

const RETENTION_DAYS = 30;

/** Delete notification_inbox rows older than 30 days. Run daily to keep table small. */
export async function handleCleanupNotifications(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(notificationInbox)
    .where(lt(notificationInbox.createdAt, cutoff));
  log.info('cleanup-notifications: done', { cutoff });
}
