import type { Context } from 'hono';
import { sentryCaptureException } from './sentry.js';
import { captureException } from './posthog.js';
import { log } from './logger.js';

export function reportAndReturn500(
  c: Context,
  err: unknown,
  context: { userId?: string; extra?: Record<string, unknown> } = {},
) {
  const path = c.req.path;
  const method = c.req.method;
  log.error({ err, userId: context.userId, path, ...context.extra }, `${method} ${path} failed`);
  sentryCaptureException(err, { userId: context.userId, path, method, extra: context.extra });
  captureException(err, context.userId, { path, method, ...context.extra });
  return c.json({ error: 'Internal server error' }, 500);
}
