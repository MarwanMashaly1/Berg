import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] SENTRY_DSN not set — error tracking disabled');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'production',
    // 10% perf sampling in prod — full for errors regardless
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [Sentry.httpIntegration()],
  });
  initialized = true;
  console.log(`[sentry] Initialized (env=${process.env.NODE_ENV ?? 'production'})`);
}

/** Capture an exception. No-op if Sentry is not initialized. */
export function sentryCaptureException(
  err: unknown,
  context?: { userId?: string; path?: string; method?: string; extra?: Record<string, unknown> }
) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context?.userId) scope.setUser({ id: context.userId });
    if (context?.path) scope.setTag('path', context.path);
    if (context?.method) scope.setTag('method', context.method);
    if (context?.extra) scope.setExtras(context.extra);
    Sentry.captureException(err);
  });
}

export { Sentry };
