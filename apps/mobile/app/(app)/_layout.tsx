import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCurrentUser } from '../../hooks/use-current-user';

// Must match storagePrefix ('berg') + '_cookie' in lib/auth.ts
const SESSION_COOKIE_KEY = 'berg_cookie';

export default function AppLayout() {
  const { user, isPending } = useCurrentUser();
  const everHadSession = useRef(false);

  useEffect(() => {
    console.log('[app-layout] session:', !!user, '| isPending:', isPending, '| everHad:', everHadSession.current);
    if (user) {
      everHadSession.current = true;
      return;
    }
    if (isPending) return;
    if (everHadSession.current) return;
    const storedCookie = SecureStore.getItem(SESSION_COOKIE_KEY);
    console.log('[app-layout] no session, no pending, storedCookie:', !!storedCookie);
    if (storedCookie) return;
    console.log('[app-layout] → redirecting to welcome');
    router.replace('/(auth)/welcome');
  }, [user, isPending]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
