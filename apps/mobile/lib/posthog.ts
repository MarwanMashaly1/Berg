import PostHog from 'posthog-react-native';
import { Config } from './config';

// No-op stub used when the key is missing — prevents flush errors in dev/CI
const noop = () => {};
const noopPosthog = {
  identify: noop, reset: noop, screen: noop, capture: noop, flush: noop,
} as unknown as PostHog;

export const posthog: PostHog = Config.posthogKey
  ? new PostHog(Config.posthogKey, {
      host: Config.posthogHost,
      // Flush early and often — smaller queue = less lost on background kill
      flushAt: 5,
      flushInterval: 5_000,
      // No errorTracking — Sentry is the error tracker; both racing to flush on
      // uncaught exceptions is what causes the "failed to flush" noise
    })
  : noopPosthog;
