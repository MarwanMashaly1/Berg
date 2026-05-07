import * as Sentry from '@sentry/react-native';
import { posthog } from './posthog';

// ─── Identify / reset ─────────────────────────────────────────────────────────

export function identifyUser(id: string, props: { name?: string | null; email?: string | null }) {
  posthog.identify(id, {
    name: props.name ?? undefined,
    email: props.email ?? undefined,
  });
  // Sync to Sentry so errors are attributed to the right user
  Sentry.setUser({ id, username: props.name ?? undefined, email: props.email ?? undefined });
}

export function resetUser() {
  posthog.reset();
  Sentry.setUser(null);
}

// ─── Error capture ────────────────────────────────────────────────────────────

/**
 * Report an error to both Sentry (primary) and PostHog (user timeline).
 * Call this in catch blocks for API errors, auth failures, etc.
 */
export function captureError(err: unknown, context?: Record<string, unknown>) {
  // Sentry — full stack trace, source maps, release info
  Sentry.captureException(err, context ? { extra: context } : undefined);

  // PostHog — surfaces the error on the user's event timeline
  const message = err instanceof Error ? err.message : String(err);
  posthog.capture('$exception', {
    $exception_message: message,
    $exception_type: err instanceof Error ? err.constructor.name : 'Error',
    $exception_stack_trace_raw: err instanceof Error ? err.stack : undefined,
    ...context,
  });
}

// ─── Screen tracking ──────────────────────────────────────────────────────────

export function trackScreen(screenName: string) {
  posthog.screen(screenName);
}

// ─── Events ───────────────────────────────────────────────────────────────────

export function trackMotiveCreated(props: {
  category: string;
  invitee_count: number;
  has_place: boolean;
  has_date: boolean;
  status: string;
}) {
  posthog.capture('motive_created', props);
}

export function trackPlaceSelected(props: { source: 'nearby' | 'search'; category: string }) {
  posthog.capture('place_selected', props);
}

export function trackPromptAnswered(props: { promptId: string; optionKey: string; has_story: boolean }) {
  posthog.capture('prompt_answered', props);
}

export function trackMemorySaved(props: { rating: number; photo_count: number; vibe_tag_count: number }) {
  posthog.capture('memory_saved', props);
}

export function trackFriendRequestSent() {
  posthog.capture('friend_request_sent');
}

export function trackCircleCreated(props: { category: string }) {
  posthog.capture('circle_created', props);
}

export function trackOnboardingStep(step: number) {
  posthog.capture('onboarding_step_completed', { step });
}

export function trackOnboardingCompleted() {
  posthog.capture('onboarding_completed');
}
