import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { lookupCode } from '../lib/code-store.js';
import { auth } from '../auth.js';
import { rateLimiter, API_LIMITS } from '../lib/rate-limiter.js';
import { createDemoSession } from './demo-auth.js';

export const verifyCodeRoutes = new Hono();

const schema = z.object({
  // Either provide an 8-char short code (from email)
  code: z.string().length(8).optional(),
  email: z.string().email().optional(),
  // Or provide the full magic link token directly (from tapping the email link)
  token: z.string().min(20).optional(),
}).refine((d) => d.code || d.token, 'Either code or token is required');

verifyCodeRoutes.post('/', zValidator('json', schema), async (c) => {
  const { code, token: directToken } = c.req.valid('json');

  // Rate limit by the submitted code/token to prevent brute-force
  const rlKey = `verify-code:${(code ?? directToken ?? '').slice(0, 32)}`;
  const rl = rateLimiter.check(rlKey, API_LIMITS.verifyCode.limit, API_LIMITS.verifyCode.windowMs);
  if (!rl.allowed) {
    c.header('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return c.json({ error: 'Too many attempts. Try again later.' }, 429);
  }

  // Demo code bypass — lets store reviewers log in without a real magic link
  const demoCode = process.env.DEMO_CODE;
  if (demoCode && code?.toUpperCase() === demoCode.toUpperCase()) {
    const setCookie = await createDemoSession(c.req.header('x-forwarded-for'));
    return c.json({ setCookie });
  }

  // Resolve the full magic link token
  let token: string | null = directToken ?? null;
  if (!token && code) {
    token = lookupCode(code.toUpperCase());
  }
  if (!token) {
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  // Verify the magic link token via BetterAuth's handler (server-side, no redirect issues).
  // BetterAuth returns a 302 with Set-Cookie containing the session token.
  const baseURL = `http://localhost:${process.env.PORT ?? 3000}`;
  const verifyURL = new URL('/api/auth/magic-link/verify', baseURL);
  verifyURL.searchParams.set('token', token);
  // berg:// is in trustedOrigins -- server-side so no actual redirect happens
  verifyURL.searchParams.set('callbackURL', 'berg://done');

  const verifyResponse = await auth.handler(new Request(verifyURL.toString(), {
    method: 'GET',
  }));

  const setCookie = verifyResponse.headers.get('set-cookie');
  if (!setCookie) {
    console.error('[verify-code] No set-cookie in response, status:', verifyResponse.status);
    return c.json({ error: 'Verification failed -- token may be expired or already used' }, 400);
  }

  console.log('[verify-code] Verified, returning set-cookie (first 80):', setCookie.slice(0, 80));
  return c.json({ setCookie });
});
