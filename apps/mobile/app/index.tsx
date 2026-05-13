import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { authClient } from '../lib/auth';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Colors } from '../constants/theme';

// Required for expo-web-browser openAuthSessionAsync to resolve when berg:/// arrives
WebBrowser.maybeCompleteAuthSession();

/**
 * Session routing splash screen.
 *
 * Flow:
 *  1. Check SecureStore immediately — if a session cookie exists, we know
 *     the user has been here before (fast, synchronous-ish read).
 *  2. Wait for BetterAuth's useSession() to resolve (network call to validate).
 *  3. Navigate based on session + onboarding state.
 *
 * Timeout strategy:
 *  - If NO stored cookie: 6 seconds then send to Welcome (probably first-time user)
 *  - If stored cookie exists: 25 seconds before giving up — the server is just
 *    being slow. Avoids kicking valid sessions on bad networks.
 *  - With cookieCache enabled on the server, most validations complete in <100ms,
 *    so the timeout almost never fires in practice.
 */
export default function Index() {
  const { data: session, isPending } = authClient.useSession();
  const hasCachedCookie = useRef<boolean | null>(null);
  const navigated = useRef(false);

  function navigateFromSession(s: typeof session) {
    if (navigated.current) return;
    navigated.current = true;

    if (!s) {
      router.replace('/(auth)/welcome');
      return;
    }

    const user = s.user as any;
    const onboardingCompleted = user?.onboardingCompleted ?? false;

    if (!onboardingCompleted) {
      const step = parseInt(user?.onboardingStep ?? '0', 10);
      const nextStep = Math.min(step + 1, 6);
      router.replace(`/(app)/onboarding/step-${nextStep}` as any);
    } else {
      router.replace('/(app)/(tabs)/discovery');
    }
  }

  // Step 2: navigate once BetterAuth resolves
  useEffect(() => {
    if (isPending) return;
    navigateFromSession(session);
  }, [session, isPending]);

  // Smart timeout — starts AFTER SecureStore resolves so the delay is correct:
  // - No stored cookie → 6s  (first-time / signed-out user)
  // - Stored cookie exists → 25s (server slow; don't kick a valid session)
  // cookieCache means real sessions resolve in <100ms, so this rarely fires.
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;

    SecureStore.getItemAsync('berg_cookie')
      .then((val) => {
        hasCachedCookie.current = !!val;
      })
      .catch(() => {
        hasCachedCookie.current = false;
      })
      .finally(() => {
        if (navigated.current) return;
        const delay = hasCachedCookie.current ? 25_000 : 6_000;
        id = setTimeout(() => {
          if (navigated.current) return;
          navigated.current = true;
          if (hasCachedCookie.current) {
            router.replace('/(app)/(tabs)/discovery');
          } else {
            router.replace('/(auth)/welcome');
          }
        }, delay);
      });

    return () => clearTimeout(id);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.light.backgroundWarm,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LoadingSpinner size="large" color={Colors.light.primary} />
    </View>
  );
}
