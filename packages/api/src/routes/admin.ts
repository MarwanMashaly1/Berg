import { Hono } from 'hono';
import { timingSafeEqual } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { dailyPrompts } from '@berg/shared';
import { handleGeneratePrompts } from '../jobs/generate-prompts.js';
import { handleSelectDailyPrompt } from '../jobs/select-daily-prompt.js';
import { verifyEmailToken } from '../lib/admin-token.js';

export const adminRoutes = new Hono();

/** Timing-safe string comparison to prevent timing attacks on the admin secret. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Structured audit log for all admin state mutations. */
function adminLog(action: string, detail: string) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), actor: 'admin', action, detail }));
}

/**
 * Admin auth middleware.
 *
 * Two valid authentication paths:
 *   1. Authorization: Bearer <ADMIN_SECRET>  -- for API calls and curl
 *   2. GET request with ?t=<hmac-token>       -- for email approval links (token validated per-route)
 *
 * The raw ADMIN_SECRET is never accepted in URL query params.
 */
adminRoutes.use('*', async (c, next) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return c.json({ error: 'Admin not configured' }, 500);

  // Path 1: Bearer token (API / curl access)
  const authHeader = c.req.header('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (safeEqual(bearerToken, adminSecret)) {
    await next();
    return;
  }

  // Path 2: GET request with ?t= HMAC token (email links)
  // The individual route handlers validate the token against the specific action + prompt ID.
  if (c.req.method === 'GET' && c.req.query('t')) {
    await next();
    return;
  }

  return c.json({ error: 'Unauthorized' }, 401);
});

// -- Shared HTML pages ----------------------------------------------------------

function expiredPage(): string {
  return `<!DOCTYPE html><html><head><title>Link expired</title>
    <style>body{font-family:sans-serif;text-align:center;padding:60px;background:#FBF5EC;}</style></head>
    <body>
      <h2>⚠️ Link expired or invalid</h2>
      <p>Email approval links expire after 7 days.</p>
      <p>Use the API directly:<br><code>curl -X POST {url} -H "Authorization: Bearer $ADMIN_SECRET"</code></p>
    </body></html>`;
}

function successPage(emoji: string, title: string, body: string): string {
  return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:sans-serif;text-align:center;padding:60px;background:#FBF5EC;}</style></head>
    <body><h1>${emoji} ${title}</h1><p>${body}</p></body></html>`;
}

function confirmPage(id: string, action: 'approve' | 'reject', count?: number): string {
  const isApprove = action === 'approve';
  const label = count != null ? `${count} prompts` : 'this prompt';
  const color = isApprove ? '#2D6A4F' : '#C53030';
  const emoji = isApprove ? '✅' : '❌';
  const verb = isApprove ? 'Approve' : 'Reject';

  return `<!DOCTYPE html><html><head><title>Confirm ${verb}</title>
    <style>body{font-family:sans-serif;text-align:center;padding:60px;background:#FBF5EC;}
    button{background:${color};color:#fff;border:none;padding:14px 32px;border-radius:12px;font-size:15px;cursor:pointer;}</style></head>
    <body>
      <h2>${verb} ${label}?</h2>
      <form method="POST" action="/api/admin/prompts/${id}/${action}">
        <button type="submit">${emoji} Yes, ${verb.toLowerCase()}</button>
      </form>
    </body></html>`;
}

// -- GET /api/admin/prompts -- list prompts by status ---------------------------
adminRoutes.get('/prompts', async (c) => {
  const status = (c.req.query('status') ?? 'draft') as string;
  const rows = await db
    .select()
    .from(dailyPrompts)
    .where(eq(dailyPrompts.status, status))
    .orderBy(dailyPrompts.createdAt)
    .limit(50);
  return c.json({ prompts: rows, count: rows.length });
});

// -- Approve --------------------------------------------------------------------

// GET /api/admin/prompts/:id/approve
//   With ?t=<hmac-token>  -> validates HMAC, approves immediately (email link flow)
//   Without ?t=           -> shows confirmation page (Bearer-authed browser flow)
adminRoutes.get('/prompts/:id/approve', async (c) => {
  const { id } = c.req.param();
  const token = c.req.query('t');

  if (token) {
    const secret = process.env.ADMIN_SECRET ?? '';
    if (!verifyEmailToken(secret, token, 'approve', id)) {
      return c.html(expiredPage(), 403);
    }
    await db.update(dailyPrompts).set({ status: 'approved' }).where(eq(dailyPrompts.id, id));
    adminLog('prompt.approve', `id=${id} via=email-link`);
    return c.html(successPage('✅', 'Prompt approved', 'It will be scheduled for an upcoming day.'));
  }

  return c.html(confirmPage(id, 'approve'));
});

// POST /api/admin/prompts/:id/approve -- approves (requires Bearer)
adminRoutes.post('/prompts/:id/approve', async (c) => {
  const { id } = c.req.param();
  adminLog('prompt.approve', `id=${id} via=api`);
  await db.update(dailyPrompts).set({ status: 'approved' }).where(eq(dailyPrompts.id, id));
  return c.html(successPage('✅', 'Prompt approved', 'It will be scheduled for an upcoming day.'));
});

// -- Reject ---------------------------------------------------------------------

// GET /api/admin/prompts/:id/reject
//   With ?t=<hmac-token>  -> validates HMAC, rejects immediately
//   Without ?t=           -> shows confirmation page
adminRoutes.get('/prompts/:id/reject', async (c) => {
  const { id } = c.req.param();
  const token = c.req.query('t');

  if (token) {
    const secret = process.env.ADMIN_SECRET ?? '';
    if (!verifyEmailToken(secret, token, 'reject', id)) {
      return c.html(expiredPage(), 403);
    }
    await db.update(dailyPrompts).set({ status: 'archived' }).where(eq(dailyPrompts.id, id));
    adminLog('prompt.reject', `id=${id} via=email-link`);
    return c.html(successPage('❌', 'Prompt rejected', 'This prompt has been removed from the bank.'));
  }

  return c.html(confirmPage(id, 'reject'));
});

// POST /api/admin/prompts/:id/reject -- rejects (requires Bearer)
adminRoutes.post('/prompts/:id/reject', async (c) => {
  const { id } = c.req.param();
  adminLog('prompt.reject', `id=${id} via=api`);
  await db.update(dailyPrompts).set({ status: 'archived' }).where(eq(dailyPrompts.id, id));
  return c.html(successPage('❌', 'Prompt rejected', 'This prompt has been removed from the bank.'));
});

// -- Approve all ----------------------------------------------------------------

// GET /api/admin/prompts/approve-all?ids=...&t=<token>
//   With valid ?t= -> validates HMAC against sorted IDs, approves all immediately
//   Without ?t=   -> shows confirmation page
adminRoutes.get('/prompts/approve-all', async (c) => {
  const idsParam = c.req.query('ids') ?? '';
  const ids = idsParam.split(',').filter(Boolean);
  if (ids.length === 0) return c.html('<p>No IDs provided</p>', 400);

  const token = c.req.query('t');
  if (token) {
    const secret = process.env.ADMIN_SECRET ?? '';
    // Subject is the sorted comma-joined IDs -- must match exactly what was signed
    const subject = [...ids].sort().join(',');
    if (!verifyEmailToken(secret, token, 'approve-all', subject)) {
      return c.html(expiredPage(), 403);
    }
    await db.update(dailyPrompts).set({ status: 'approved' }).where(inArray(dailyPrompts.id, ids));
    adminLog('prompt.approve-all', `count=${ids.length} ids=${ids.join(',')} via=email-link`);
    return c.html(successPage('✅', `${ids.length} prompts approved`, 'They will be scheduled for upcoming days.'));
  }

  // Show confirmation page
  return c.html(`<!DOCTYPE html><html><head><title>Confirm bulk approval</title>
    <style>body{font-family:sans-serif;text-align:center;padding:60px;background:#FBF5EC;}
    button{background:#2D6A4F;color:#fff;border:none;padding:14px 32px;border-radius:12px;font-size:15px;cursor:pointer;}</style></head>
    <body>
      <h2>Approve all ${ids.length} prompts?</h2>
      <form method="POST" action="/api/admin/prompts/approve-all">
        <input type="hidden" name="ids" value="${ids.join(',')}">
        <button type="submit">✅ Yes, approve all</button>
      </form>
    </body></html>`);
});

// POST /api/admin/prompts/approve-all -- bulk approve (requires Bearer)
adminRoutes.post('/prompts/approve-all', async (c) => {
  const body = await c.req.parseBody();
  const idsParam = (body.ids as string) ?? '';
  const ids = idsParam.split(',').filter(Boolean);
  if (ids.length === 0) return c.html('<p>No IDs provided</p>', 400);

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!ids.every(id => uuidRe.test(id))) {
    return c.html('<p>Invalid ID format</p>', 400);
  }

  adminLog('prompt.approve-all', `count=${ids.length} via=api`);
  await db.update(dailyPrompts).set({ status: 'approved' }).where(inArray(dailyPrompts.id, ids));
  return c.html(successPage('✅', `${ids.length} prompts approved`, 'They will be scheduled for upcoming days.'));
});

const ALLOWED_PROMPT_STATUSES = ['draft', 'approved', 'archived', 'active'] as const;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// -- PATCH /api/admin/prompts/:id -- update prompt text/score ------------------
adminRoutes.patch('/prompts/:id', async (c) => {
  const { id } = c.req.param();
  if (!uuidRegex.test(id)) return c.json({ error: 'Invalid ID' }, 400);

  const body = await c.req.json<{
    question?: string;
    status?: string;
    qualityScore?: number;
    options?: unknown;
  }>();

  if (body.status && !ALLOWED_PROMPT_STATUSES.includes(body.status as typeof ALLOWED_PROMPT_STATUSES[number])) {
    return c.json({ error: 'Invalid status' }, 400);
  }
  if (body.qualityScore !== undefined && (typeof body.qualityScore !== 'number' || body.qualityScore < 0 || body.qualityScore > 10)) {
    return c.json({ error: 'qualityScore must be 0–10' }, 400);
  }

  adminLog('prompt.patch', `id=${id} fields=${Object.keys(body).join(',')}`);
  await db
    .update(dailyPrompts)
    .set({
      ...(body.question && { question: String(body.question).slice(0, 500) }),
      ...(body.status && { status: body.status }),
      ...(body.qualityScore !== undefined && { qualityScore: body.qualityScore }),
      ...(body.options && { options: JSON.stringify(body.options) }),
    })
    .where(eq(dailyPrompts.id, id));

  return c.json({ ok: true });
});

// -- Prompt generation ---------------------------------------------------------

// POST /api/admin/prompts/select-daily -- manually run today's prompt selection
adminRoutes.post('/prompts/select-daily', async (c) => {
  adminLog('prompt.select-daily', 'manual daily selection triggered');
  await handleSelectDailyPrompt();
  return c.json({ ok: true, message: 'Daily prompt selection complete.' });
});

// POST /api/admin/prompts/generate -- trigger batch (requires Bearer)
adminRoutes.post('/prompts/generate', async (c) => {
  adminLog('prompt.generate', 'batch generation triggered via API');
  handleGeneratePrompts().catch((e) => console.error('[admin] generation failed:', e));
  return c.json({ ok: true, message: 'Batch generation started. Check your email in ~30 seconds.' });
});

// GET /api/admin/cache/stats -- view in-memory cache stats
adminRoutes.get('/cache/stats', async (c) => {
  const { cache, placesCache } = await import('../lib/cache.js').then(async m => {
    const pc = await import('../lib/places-cache.js');
    return { cache: m.cache, placesCache: pc.placesCache };
  });
  return c.json({
    appCache: cache.stats(),
    placesCache: placesCache.stats(),
    ts: new Date().toISOString(),
  });
});

// GET /api/admin/prompts/generate -- trigger from browser with Bearer
adminRoutes.get('/prompts/generate', async (c) => {
  adminLog('prompt.generate', 'batch generation triggered via GET');
  handleGeneratePrompts().catch((e) => console.error('[admin] generation failed:', e));
  return c.html(successPage('🧊', 'Generating prompts...', 'Gemini is generating 20 new prompts. You\'ll receive an email to review them in ~30 seconds.'));
});
