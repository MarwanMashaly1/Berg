import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// Isolated route — mirrors the real deletion-request handler without DB/Resend deps
function buildApp() {
  const app = new Hono();

  app.post(
    '/api/users/deletion-request',
    zValidator('json', z.object({
      email: z.string().email(),
      reason: z.string().max(500).optional(),
    })),
    async (c) => {
      const { email, reason } = c.req.valid('json');
      // In tests RESEND_API_KEY is not set — logs only
      console.log(`[test] deletion-request from ${email}, reason: ${reason ?? 'none'}`);
      return c.json({ ok: true });
    },
  );

  return app;
}

describe('POST /api/users/deletion-request', () => {
  const app = buildApp();

  it('returns 200 for valid email', async () => {
    const res = await app.request('/api/users/deletion-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 200 with optional reason', async () => {
    const res = await app.request('/api/users/deletion-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', reason: 'Leaving the app' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid email', async () => {
    const res = await app.request('/api/users/deletion-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    const res = await app.request('/api/users/deletion-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when reason exceeds 500 chars', async () => {
    const res = await app.request('/api/users/deletion-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', reason: 'x'.repeat(501) }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-JSON body', async () => {
    const res = await app.request('/api/users/deletion-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});
