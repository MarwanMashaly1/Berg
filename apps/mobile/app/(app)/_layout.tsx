import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { authClient } from '../../lib/auth';

// Must match storagePrefix ('berg') + '_cookie' in lib/auth.ts
const SESSION_COOKIE_KEY = 'berg_cookie';

export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();
  const everHadSession = useRef(false);

  useEffect(() => {
    if (session) {
      everHadSession.current = true;
      return;
    }
    // Still loading — wait
    if (isPending) return;
    // Already confirmed a session this mount — brief null between navigations
    if (everHadSession.current) return;
    // Cookie in SecureStore means BetterAuth is still hydrating the atom.
    // Don't redirect — it will resolve to a session within the next render cycle.
    // (Timer-based grace periods fail on slow devices and cause this exact bug.)
    const storedCookie = SecureStore.getItem(SESSION_COOKIE_KEY);
    if (storedCookie) return;
    router.replace('/(auth)/welcome');
  }, [session, isPending]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
