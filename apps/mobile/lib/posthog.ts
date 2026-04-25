import PostHog from 'posthog-react-native';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;

// No-op stub used when the key is missing — prevents flush errors in dev/CI
const noop = () => {};
const noopPosthog = {
  identify: noop, reset: noop, screen: noop, capture: noop, flush: noop,
} as unknown as PostHog;

export const posthog: PostHog = apiKey
  ? new PostHog(apiKey, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      // Flush early and often — smaller queue = less lost on background kill
      flushAt: 5,
      flushInterval: 5_000,
      // No errorTracking — Sentry is the error tracker; both racing to flush on
      // uncaught exceptions is what causes the "failed to flush" noise
    })
  : noopPosthog;
