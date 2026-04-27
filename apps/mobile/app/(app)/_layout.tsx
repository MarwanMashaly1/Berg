import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { authClient } from '../../lib/auth';

export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();
  // Track whether we've ever seen a valid session so we don't eject
  // the user during a brief re-validation on slow networks.
  const everHadSession = useRef(false);

  useEffect(() => {
    if (session) {
      everHadSession.current = true;
      return;
    }
    // Only redirect if BetterAuth is certain there's no session (not still loading)
    // AND we never had a valid session in this app run.
    if (!isPending && !everHadSession.current) {
      router.replace('/(auth)/welcome');
    }
  }, [session, isPending]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
