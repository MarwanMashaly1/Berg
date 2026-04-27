import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { authClient } from '../../lib/auth';

export default function AuthLayout() {
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending || !session) return;

    const user = session.user as any;
    const onboardingCompleted = user?.onboardingCompleted ?? false;

    if (!onboardingCompleted) {
      const step = parseInt(user?.onboardingStep ?? '0', 10);
      const nextStep = Math.min(step + 1, 6);
      router.replace(`/(app)/onboarding/step-${nextStep}` as any);
    } else {
      router.replace('/(app)/(tabs)/discovery');
    }
  }, [session, isPending]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="magic-link-sent" />
      <Stack.Screen name="magic-link-callback" />
    </Stack>
  );
}
