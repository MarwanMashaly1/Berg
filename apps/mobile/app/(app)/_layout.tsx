import { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import { authClient } from '../../lib/auth';

export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();
  const everHadSession = useRef(false);
  // Grace period: don't redirect on the very first render — BetterAuth's atom
  // may report isPending=false briefly before hydrating from SecureStore.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (session) {
      everHadSession.current = true;
      return;
    }
    if (settled && !isPending && !everHadSession.current) {
      router.replace('/(auth)/welcome');
    }
  }, [session, isPending, settled]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
