import { PostHog } from 'posthog-node';

export const posthog = new PostHog(process.env.POSTHOG_API_KEY ?? '', {
  host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
  flushAt: 20,
  flushInterval: 10_000,
});

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
