import { PostHog } from 'posthog-node';

const apiKey = process.env.POSTHOG_API_KEY;

// No-op client when key is absent — prevents flush errors and removes noise in dev
const noop = () => {};
const noopClient = {
  capture: noop,
  identify: noop,
  flush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
} as unknown as PostHog;

export const posthog: PostHog = apiKey
  ? new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
      flushAt: 5,
      flushInterval: 5_000,
    })
  : noopClient;

// Drain the queue before the process exits so no events are lost
if (apiKey) {
  const shutdown = () => posthog.shutdown().catch(() => {});
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  process.once('beforeExit', shutdown);
}

/** Capture a server-side exception to PostHog. userId optional if not authed. */
export function captureException(err: unknown, userId?: string, extra?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  posthog.capture({
    distinctId: userId ?? 'server',
    event: '$exception',
    properties: {
      $exception_message: message,
      $exception_type: err instanceof Error ? err.constructor.name : 'UnknownError',
      $exception_stack_trace_raw: stack,
      ...extra,
    },
  });
}
