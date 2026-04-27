import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { getSetCookie } from '@better-auth/expo/client';
import { authClient } from '../../lib/auth';
import { identifyUser } from '../../lib/analytics';
import { Colors, Fonts } from '../../constants/theme';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

const C = Colors.light;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// Key that BetterAuth's Expo plugin uses to store the session cookie.
// Derived from: storagePrefix + '_cookie' (see expoClient config: storagePrefix: 'berg')
const COOKIE_STORAGE_KEY = 'berg_cookie';

export default function MagicLinkCallbackScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();

  useEffect(() => {
    if (token) {
      verifyAndLogin(token);
    } else {
      checkExistingSession();
    }
  }, [token]);

  async function checkExistingSession() {
    await new Promise((r) => setTimeout(r, 600));
    const session = await authClient.getSession();
    if (session.data) {
      router.replace('/(app)/(tabs)/discovery');
    } else {
      router.replace({ pathname: '/(auth)/signup', params: { error: 'link_expired' } });
    }
  }

  async function verifyAndLogin(t: string) {
    try {
      // Server-side verification: server calls BetterAuth verify internally,
      // captures the Set-Cookie from BetterAuth's 302 response (no redirect issues),
      // and returns it here so we can store it in SecureStore directly.
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),  // full 32-char token from URL or code lookup
      });

      if (!res.ok) {
        throw new Error('Verification failed');
      }

      const data = await res.json() as { setCookie?: string; error?: string };

      if (!data.setCookie) throw new Error('No session cookie returned');

      const prevCookie = SecureStore.getItem(COOKIE_STORAGE_KEY);
      const cookieJson = getSetCookie(data.setCookie, prevCookie ?? undefined);
      SecureStore.setItem(COOKIE_STORAGE_KEY, cookieJson);

      const sessionResult = await authClient.getSession();
      if (!sessionResult.data) throw new Error('Session not found after verify');

      const user = sessionResult.data.user as any;
      identifyUser(user.id, { name: user.name, email: user.email });

      if (!user?.onboardingCompleted) {
        const step = parseInt(user?.onboardingStep ?? '0', 10);
        const nextStep = Math.min(step + 1, 6);
        router.replace(`/(app)/onboarding/step-${nextStep}` as any);
      } else {
        router.replace('/(app)/(tabs)/discovery');
      }
    } catch (err) {
      console.error('[callback] Verification error:', err);
      router.replace({ pathname: '/(auth)/signup', params: { error: 'link_expired' } });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWarm, alignItems: 'center', justifyContent: 'center' }}>
      <LoadingSpinner size="large" color={C.primary} />
      <Text style={{ fontFamily: Fonts.body, fontSize: 15, color: '#9a8a7a', marginTop: 16 }}>
        Signing you in…
      </Text>
    </View>
  );
}
