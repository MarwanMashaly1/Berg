import { createMiddleware } from 'hono/factory';
import { auth } from '../auth';

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

/**
 * Attach session to context. Does NOT block unauthenticated requests.
 * Use requireAuth middleware to protect specific routes.
 */
export const sessionMiddleware = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set('user', session?.user ?? null);
    c.set('session', session?.session ?? null);
    await next();
  }
);

/**
 * Block unauthenticated requests with 401.
 */
export const requireAuth = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  }
);
