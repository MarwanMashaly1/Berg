import * as Sentry from '@sentry/react-native';
import { Config } from './config';

let initialized = false;

/**
 * Initialize Sentry. Safe to call unconditionally — never throws.
 * No-op if EXPO_PUBLIC_SENTRY_DSN is not set (dev without credentials).
 */
export function initSentry() {
  if (initialized) return;
  const dsn = Config.sentryDsn;
  if (!dsn) return;

  try {
    Sentry.init({
      dsn,
      enabled: !__DEV__,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: 0.1,
      // Disable automatic session tracking to reduce noise
      autoSessionTracking: true,
      // Disable native crash reporting if native module not available
      enableNative: true,
      enableNativeCrashHandling: true,
    });
    initialized = true;
  } catch {
    // Native module not available (simulator, bare Expo without plugin, etc.)
    // PostHog already captures errors as fallback — safe to continue without Sentry
  }
}

export { Sentry };
export { initialized as isSentryInitialized };
