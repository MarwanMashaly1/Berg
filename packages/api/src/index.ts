import 'dotenv/config';
// Sentry must be initialized before any other imports that might throw
import { initSentry, sentryCaptureException } from './lib/sentry.js';
initSentry();
import { log } from './lib/logger.js';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { auth } from './auth';
import { sessionMiddleware } from './middleware/auth';
import { phoneRoutes } from './routes/phone';
import { verifyCodeRoutes } from './routes/verify-code';
import { userRoutes, userPublicRoutes } from './routes/users.js';
import { vibeTagRoutes } from './routes/vibe-tags.js';
import { promptRoutes } from './routes/prompts.js';
import { discoveryRoutes } from './routes/discovery.js';
import { circlesRoutes } from './routes/circles.js';
import { profileRoutes } from './routes/profile.js';
import { chatsRoutes } from './routes/chats.js';
import { motivesRoutes } from './routes/motives.js';
import { memoriesRoutes } from './routes/memories.js';
import { placesRoutes } from './routes/places.js';
import { startWorkers } from './jobs/index.js';
import { notificationsRoutes } from './routes/notifications.js';
import { adminRoutes } from './routes/admin.js';
import { matchesRoutes } from './routes/matches.js';
import { posthog, captureException } from './lib/posthog';
import { db, client } from './db.js';
import { sql } from 'drizzle-orm';
import { stopQueue } from './lib/queue.js';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const app = new Hono<{ Variables: Variables }>();

app.use('*', requestId());

// --- Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
});

// --- Request logger + performance tracking -----------------------------------
app.use('*', async (c, next) => {
  const rid = c.get('requestId');
  const start = Date.now();
  log.info({ rid, method: c.req.method, path: c.req.path }, 'request');
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;
  log.info({ rid, method: c.req.method, path: c.req.path, status, ms }, 'response');

  // Capture slow requests (>2s) to PostHog for performance visibility
  if (ms > 2000) {
    const userId = c.get('user')?.id;
    posthog.capture({
      distinctId: userId ?? 'server',
      event: 'api_slow_request',
      properties: {
        path: c.req.path,
        method: c.req.method,
        status,
        duration_ms: ms,
      },
    });
  }
});

// --- Global request timeout (30s) — prevents indefinite hangs on Gemini/Places calls ---
app.use('/api/*', async (c, next) => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out after 30s')), 30_000)
  );
  await Promise.race([next(), timeout]);
});

// --- CORS --------------------------------------------------------------------
app.use(
  '/api/*',
  cors({
    origin: [
      'berg://',
      ...(process.env.NODE_ENV !== 'production' ? ['exp://'] : []),
      ...(process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) ?? []),
    ],
    allowHeaders: ['Content-Type', 'Authorization', 'x-phone-session-id'],
    allowMethods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['set-auth-token'],
    credentials: true,
  })
);

// --- Session middleware -- MUST run before route handlers that need auth ------
// Health check — verifies DB connectivity; Render takes instance out of rotation on 503
app.get('/health', async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ ok: true, db: 'ok' });
  } catch {
    return c.json({ ok: false, db: 'unreachable' }, 503);
  }
});

// Magic link deep-link redirect — receives token from email button, redirects to app
// WITHOUT consuming the token. App then calls /api/auth/verify-code for the one real verification.
app.get('/api/auth/magic-link-open', (c) => {
  const token = c.req.query('token');
  if (!token) return c.text('Bad request', 400);
  return c.redirect(`berg://magic-link-callback?token=${encodeURIComponent(token)}`);
});

// Public user routes (no auth) — must be before sessionMiddleware
app.route('/api/users', userPublicRoutes);

app.use('/api/*', sessionMiddleware);

// --- Custom routes BEFORE BetterAuth (prevents /api/auth/* wildcard stealing them) --
app.route('/api/phone', phoneRoutes);
app.route('/api/auth/verify-code', verifyCodeRoutes);
app.route('/api/users', userRoutes);
app.route('/api/vibe-tags', vibeTagRoutes);
app.route('/api/prompts', promptRoutes);
app.route('/api/discovery', discoveryRoutes);
app.route('/api/circles', circlesRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/chats', chatsRoutes);
app.route('/api/motives', memoriesRoutes);   // memories sub-routes on /api/motives/:id/memories/*
app.route('/api/motives', motivesRoutes);
app.route('/api/places', placesRoutes);
app.route('/api/notifications', notificationsRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/matches', matchesRoutes);

// --- BetterAuth handler -- catches all remaining /api/auth/* ------------------
app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
  const timeout = new Promise<Response>((_, reject) =>
    setTimeout(() => reject(new Error('BetterAuth timed out after 8s')), 8000)
  );
  try {
    const res = await Promise.race([auth.handler(c.req.raw), timeout]) as Response;
    if (res.status !== 200) {
      const body = await res.clone().text();
      log.warn({ path: c.req.path, status: res.status, body }, 'betterauth non-200');
    }
    return res;
  } catch (err) {
    log.error({ err, path: c.req.path }, 'betterauth handler error');
    sentryCaptureException(err, { path: c.req.path, method: c.req.method });
    captureException(err, undefined, { path: c.req.path, method: c.req.method, source: 'better-auth' });
    return c.json({ error: String(err) }, 500);
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  const rid = c.get('requestId');
  const userId = c.get('user')?.id;
  const ctx = { path: c.req.path, method: c.req.method };
  log.error({ err, rid, userId, ...ctx }, 'unhandled route error');
  // Dual-report: Sentry for full stack traces + source maps, PostHog for user timeline
  sentryCaptureException(err, { userId, ...ctx });
  captureException(err, userId, ctx);
  return c.json({ error: 'Internal server error' }, 500);
});

// Health check
app.get('/', (c) => c.json({ status: 'Berg API', version: '0.0.1' }));

// --- Server ------------------------------------------------------------------
const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  log.info({ port: info.port }, 'Berg API running');
  startWorkers().catch((err) => log.error({ err }, 'workers failed to start'));
});

// ─── Process-level safety nets ────────────────────────────────────────────────
// These catch anything that escapes Hono's onError (e.g. bg workers, timers)
process.on('uncaughtException', (err) => {
  log.error({ err }, 'uncaughtException');
  sentryCaptureException(err, { extra: { source: 'uncaughtException' } });
  captureException(err, undefined, { source: 'uncaughtException' });
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  log.error({ err }, 'unhandledRejection');
  sentryCaptureException(err, { extra: { source: 'unhandledRejection' } });
  captureException(err, undefined, { source: 'unhandledRejection' });
});

async function shutdown() {
  log.info('shutdown: draining...');
  await stopQueue().catch((err) => log.error({ err }, 'shutdown: queue stop failed'));
  await client.end().catch((err) => log.error({ err }, 'shutdown: db close failed'));
  await posthog.shutdown().catch((err) => log.error({ err }, 'shutdown: posthog flush failed'));
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app };
