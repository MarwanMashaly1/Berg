import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { auth } from './auth';
import { sessionMiddleware } from './middleware/auth';
import { phoneRoutes } from './routes/phone';
import { verifyCodeRoutes } from './routes/verify-code';
import { userRoutes } from './routes/users.js';
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

// â”€â”€â”€ Security headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// â”€â”€â”€ Request logger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use('*', async (c, next) => {
  console.log(`â†’ ${c.req.method} ${c.req.path}`);
  await next();
  console.log(`â† ${c.req.method} ${c.req.path} ${c.res.status}`);
});

// â”€â”€â”€ CORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Session middleware â€” MUST run before route handlers that need auth â”€â”€â”€â”€â”€â”€
// Health check — no auth, used by UptimeRobot to keep the server alive
app.get('/health', (c) => c.json({ ok: true }));

app.use('/api/*', sessionMiddleware);

// â”€â”€â”€ Custom routes BEFORE BetterAuth (prevents /api/auth/* wildcard stealing them) â”€â”€
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

// â”€â”€â”€ BetterAuth handler â€” catches all remaining /api/auth/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.on(['POST', 'GET'], '/api/auth/*', async (c) => {
  const timeout = new Promise<Response>((_, reject) =>
    setTimeout(() => reject(new Error('BetterAuth timed out after 8s')), 8000)
  );
  try {
    const res = await Promise.race([auth.handler(c.req.raw), timeout]) as Response;
    if (res.status !== 200) {
      const body = await res.clone().text();
      console.error(`ðŸ”´ BetterAuth ${c.req.path} â†’ ${res.status}:`, body);
    }
    return res;
  } catch (err) {
    console.error('ðŸ”´ Auth handler error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  const userId = c.get('user')?.id;
  console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
  captureException(err, userId, { path: c.req.path, method: c.req.method });
  return c.json({ error: 'Internal server error' }, 500);
});

// Health check
app.get('/', (c) => c.json({ status: 'Berg API', version: '0.0.1' }));

// â”€â”€â”€ Server â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Berg API running on http://localhost:${info.port}`);
  // Start pg-boss workers after server is up
  startWorkers().catch((err) => console.error('[workers] Failed to start:', err));
});

process.on('SIGTERM', () => posthog.shutdown());
process.on('SIGINT', () => posthog.shutdown());

export { app };
