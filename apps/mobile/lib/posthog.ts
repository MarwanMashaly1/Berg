import PostHog from 'posthog-react-native';

export const posthog = new PostHog(
  process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
  {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    errorTracking: {
      autocapture: {
        uncaughtExceptions: true,
        unhandledRejections: true,
        // console interception intentionally omitted — it suppresses React Native's
        // error overlay and makes debugging impossible (white screen instead of red screen)
      },
    },
  },
);
