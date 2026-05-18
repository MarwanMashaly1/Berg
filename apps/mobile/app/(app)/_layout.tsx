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
    console.log('[app-layout] session:', !!session, '| isPending:', isPending, '| everHad:', everHadSession.current);
    if (session) {
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
  }, [session, isPending]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
