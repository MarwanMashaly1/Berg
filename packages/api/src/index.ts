import 'dotenv/config';
// Sentry must be initialized before any other imports that might throw
import { initSentry, sentryCaptureException } from './lib/sentry.js';
initSentry();

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { auth } from './auth';
import { sessionMiddleware } from './middleware/auth';
import { phoneRoutes } from './routes/phone';
import { verifyCodeRoutes } from './routes/verify-code';
import { userRoutes, userPublicRoutes } from './routes/users.js';
import { vibeTagRoutes } from './routes/vibe-tags.js';
import { promptRoutes } from './routes/prompts.js';
import { discoveryRoutes, circlesRoutes } from './routes/discovery.js';
import { profileRoutes } from './routes/profile.js';
import { chatsRoutes } from './routes/chats.js';
import { motivesRoutes } from './routes/motives.js';
import { memoriesRoutes } from './routes/memories.js';
import { placesRoutes } from './routes/places.js';
import { startWorkers } from './jobs/index.js';
import { notificationsRoutes } from './routes/notifications.js';
import { adminRoutes } from './routes/admin.js';
import { posthog, captureException } from './lib/posthog';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const app = new Hono<{ Variables: Variables }>();

// --- Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// --- Request logger + performance tracking -----------------------------------
app.use('*', async (c, next) => {
  const start = Date.now();
  console.log(`-> ${c.req.method} ${c.req.path}`);
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;
  console.log(`<- ${c.req.method} ${c.req.path} ${status} ${ms}ms`);

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
// Health check — no auth, used by UptimeRobot to keep the server alive
app.get('/health', (c) => c.json({ ok: true }));

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

// --- get-session debug logger -------------------------------------------------
app.get('/api/auth/get-session', async (c, next) => {
  const cookie = c.req.header('cookie');
  console.log(`[get-session] cookie header present: ${!!cookie} | first 80: ${cookie?.slice(0, 80) ?? 'NONE'}`);
  await next();
  console.log(`[get-session] response status: ${c.res.status}`);
});

// --- Google OAuth callback debug logger --------------------------------------
app.get('/api/auth/callback/google', async (c, next) => {
  const code = c.req.query('code');
  const error = c.req.query('error');
  const errorDesc = c.req.query('error_description');
  const state = c.req.query('state');
  console.log(`[google-oauth] callback hit — code:${code ? 'YES' : 'NO'} error:${error ?? 'none'} errorDesc:${errorDesc ?? 'none'} state:${state ? 'YES' : 'NO'}`);
  console.log(`[google-oauth] GOOGLE_CLIENT_ID set: ${!!process.env.GOOGLE_CLIENT_ID}`);
  console.log(`[google-oauth] GOOGLE_CLIENT_SECRET set: ${!!process.env.GOOGLE_CLIENT_SECRET}`);
  console.log(`[google-oauth] BETTER_AUTH_URL: ${process.env.BETTER_AUTH_URL ?? '(not set)'}`);
  return next();
});

// --- BetterAuth handler -- catches all remaining /api/auth/* ------------------
app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
  const timeout = new Promise<Response>((_, reject) =>
    setTimeout(() => reject(new Error('BetterAuth timed out after 8s')), 8000)
  );
  try {
    const res = await Promise.race([auth.handler(c.req.raw), timeout]) as Response;
    if (res.status !== 200) {
      const body = await res.clone().text();
      console.error(`🔴 BetterAuth ${c.req.path} -> ${res.status}:`, body);
    }
    return res;
  } catch (err) {
    console.error('🔴 Auth handler error:', err);
    sentryCaptureException(err, { path: c.req.path, method: c.req.method });
    captureException(err, undefined, { path: c.req.path, method: c.req.method, source: 'better-auth' });
    return c.json({ error: String(err) }, 500);
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  const userId = c.get('user')?.id;
  const ctx = { path: c.req.path, method: c.req.method };
  console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
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
  console.log(`Berg API running on http://localhost:${info.port}`);
  // Start pg-boss workers after server is up
  startWorkers().catch((err) => console.error('[workers] Failed to start:', err));
});

// ─── Process-level safety nets ────────────────────────────────────────────────
// These catch anything that escapes Hono's onError (e.g. bg workers, timers)
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  sentryCaptureException(err, { extra: { source: 'uncaughtException' } });
  captureException(err, undefined, { source: 'uncaughtException' });
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('[unhandledRejection]', err);
  sentryCaptureException(err, { extra: { source: 'unhandledRejection' } });
  captureException(err, undefined, { source: 'unhandledRejection' });
});

process.on('SIGTERM', () => posthog.shutdown());
process.on('SIGINT', () => posthog.shutdown());

export { app };
