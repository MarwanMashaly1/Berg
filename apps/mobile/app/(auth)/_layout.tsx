import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useCurrentUser } from '../../hooks/use-current-user';
import { Routes } from '../../lib/routes';

export default function AuthLayout() {
  const { user, isPending } = useCurrentUser();

  useEffect(() => {
    if (isPending || !user) return;

    const userAny = user as any;
    const onboardingCompleted = userAny?.onboardingCompleted ?? false;

    if (!onboardingCompleted) {
      const step = parseInt(userAny?.onboardingStep ?? '0', 10);
      const nextStep = Math.min(step + 1, 6);
      router.replace(Routes.onboarding(nextStep as 1|2|3|4|5|6));
    } else {
      router.replace(Routes.discovery);
    }
  }, [user, isPending]);

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
