import { db } from '../db.js';
import { dailyPrompts } from '@berg/shared';
import { eq, isNull, and, ne, desc, sql } from 'drizzle-orm';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Daily prompt selection algorithm.
 * Runs at midnight, picks the best approved prompt for today using variety rules:
 *
 * Variety rules (descending priority):
 * 1. Must be approved and have no activeDate assigned yet
 * 2. Must NOT be the same type as any prompt used in the last 3 days
 * 3. Prefer NOT the same category as any prompt used in the last 7 days
 * 4. Among remaining: highest qualityScore first, then oldest (least recently generated)
 *
 * Job name: 'prompts/select-daily'
 */
export async function handleSelectDailyPrompt(): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Check if today already has a prompt assigned
  const existing = await db
    .select({ id: dailyPrompts.id })
    .from(dailyPrompts)
    .where(eq(dailyPrompts.activeDate, today))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[prompts] Today (${today}) already has a prompt â€” skipping`);
    return;
  }

  // Get types used in the last 3 days
  const last3Days = new Date();
  last3Days.setDate(last3Days.getDate() - 3);
  const recentByType = await db
    .select({ type: dailyPrompts.type })
    .from(dailyPrompts)
    .where(
      and(
        eq(dailyPrompts.status, 'active'),
        sql`${dailyPrompts.activeDate} >= ${last3Days.toISOString().split('T')[0]}`,
      ),
    );
  const recentTypes = new Set(recentByType.map((r) => r.type));

  // Get categories used in the last 7 days
  const last7Days = new Date();
  last7Days.setDate(last7Days.getDate() - 7);
  const recentByCat = await db
    .select({ category: dailyPrompts.category })
    .from(dailyPrompts)
    .where(
      and(
        eq(dailyPrompts.status, 'active'),
        sql`${dailyPrompts.activeDate} >= ${last7Days.toISOString().split('T')[0]}`,
      ),
    );
  const recentCategories = new Set(recentByCat.map((r) => r.category));

  // Fetch all approved, unscheduled prompts
  const candidates = await db
    .select()
    .from(dailyPrompts)
    .where(
      and(
        eq(dailyPrompts.status, 'approved'),
        isNull(dailyPrompts.activeDate),
      ),
    )
    .orderBy(
      desc(dailyPrompts.qualityScore),  // prefer higher quality
      dailyPrompts.createdAt,           // then oldest (FIFO)
    );

  if (candidates.length === 0) {
    console.error('[prompts] No approved prompts available! Bank is empty â€” please review drafts.');
    // Alert the admin
    await notifyEmptyBank();
    return;
  }

  // Apply variety rules: type first, then category
  const noTypeConflict = candidates.filter((p) => !recentTypes.has(p.type));
  const pool = noTypeConflict.length > 0 ? noTypeConflict : candidates; // fallback if all types repeat

  const noCatConflict = pool.filter((p) => !recentCategories.has(p.category));
  const finalPool = noCatConflict.length > 0 ? noCatConflict : pool; // fallback if all categories repeat

  const selected = finalPool[0];

  // Assign today's date and set as active
  await db
    .update(dailyPrompts)
    .set({
      status: 'active',
      activeDate: today,
      lastUsedAt: new Date(),
      useCount: sql`${dailyPrompts.useCount} + 1`,
    })
    .where(eq(dailyPrompts.id, selected.id));

  console.log(
    `[prompts] Selected for ${today}: "${selected.question}" (type=${selected.type}, category=${selected.category})`,
  );

  // Archive yesterday's prompt
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  await db
    .update(dailyPrompts)
    .set({ status: 'archived' })
    .where(
      and(eq(dailyPrompts.activeDate, yesterdayStr), eq(dailyPrompts.status, 'active')),
    );
}

async function notifyEmptyBank(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  await resend.emails.send({
    from: 'Berg <info@salamcity.ca>',
    to: adminEmail,
    subject: 'âš ï¸ Berg: no approved prompts for today',
    html: `
      <p>The prompt bank is empty â€” no approved prompts are available for today.</p>
      <p>Please approve some draft prompts or generate a new batch.</p>
      <p>Trigger a new batch: <a href="${process.env.API_BASE_URL}/api/admin/prompts/generate?token=${process.env.ADMIN_SECRET}">Generate now</a></p>
    `,
  }).catch(() => {});
}
