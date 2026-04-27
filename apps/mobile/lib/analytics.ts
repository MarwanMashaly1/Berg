import { posthog } from './posthog';

// ─── Identify / reset ─────────────────────────────────────────────────────────

export function identifyUser(id: string, props: { name?: string | null; email?: string | null }) {
  posthog.identify(id, {
    name: props.name ?? undefined,
    email: props.email ?? undefined,
  });
}

export function resetUser() {
  posthog.reset();
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
