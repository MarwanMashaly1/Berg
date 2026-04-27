import { authClient } from '../lib/auth';

export function useCurrentUser() {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user ?? null;
  const onboardingStep = parseInt((user as any)?.onboardingStep ?? '0', 10);
  const onboardingCompleted = (user as any)?.onboardingCompleted ?? false;

  return {
    user,
    isPending,
    isAuthenticated: !!user,
    onboardingStep,
    onboardingCompleted,
  };
}
