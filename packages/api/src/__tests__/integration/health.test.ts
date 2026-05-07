import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

// Minimal app mirroring the two health endpoints in index.ts
const app = new Hono();
app.get('/health', (c) => c.json({ ok: true }));
app.get('/', (c) => c.json({ status: 'Berg API', version: '0.0.1' }));
app.get('/api/auth/magic-link-open', (c) => {
  const token = c.req.query('token');
  if (!token) return c.text('Bad request', 400);
  return c.redirect(`berg://magic-link-callback?token=${encodeURIComponent(token)}`);
});

describe('GET /health', () => {
  it('returns 200 with ok: true', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

describe('GET /', () => {
  it('returns API info', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('Berg API');
    expect(body.version).toBe('0.0.1');
  });
});

describe('GET /api/auth/magic-link-open', () => {
  it('redirects to berg:// deep link with token', async () => {
    const res = await app.request('/api/auth/magic-link-open?token=abc123');
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('berg://magic-link-callback');
    expect(location).toContain('abc123');
  });

  it('returns 400 when token is missing', async () => {
    const res = await app.request('/api/auth/magic-link-open');
    expect(res.status).toBe(400);
  });

  it('URL-encodes the token in the redirect', async () => {
    const token = 'token with spaces+special=chars';
    const res = await app.request(`/api/auth/magic-link-open?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    // Token in redirect should be encoded — not raw spaces
    expect(location).not.toContain(' ');
  });
});
