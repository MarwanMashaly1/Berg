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
      const user = session.data.user as any;
      if (!user?.onboardingCompleted) {
        const step = parseInt(user?.onboardingStep ?? '0', 10);
        const nextStep = Math.min(step + 1, 6);
        router.replace(`/(app)/onboarding/step-${nextStep}` as any);
      } else {
        router.replace('/(app)/(tabs)/discovery');
      }
    } else {
      router.replace({ pathname: '/(auth)/signup', params: { error: 'link_expired' } });
    }
  }

  async function verifyAndLogin(t: string) {
    try {
      console.log('[magic-link] verifyAndLogin start, token length:', t.length);
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });

      console.log('[magic-link] verify-code response status:', res.status);
      if (!res.ok) throw new Error(`Verification failed: ${res.status}`);

      const data = await res.json() as { setCookie?: string; error?: string };
      console.log('[magic-link] setCookie present:', !!data.setCookie, '| error:', data.error);

      if (!data.setCookie) throw new Error('No session cookie returned');

      // Start fresh — passing '{}' prevents stale session_data from a previous login
      // contaminating the new session via BetterAuth's cookieCache
      const cookieJson = getSetCookie(data.setCookie, '{}');
      console.log('[magic-link] cookieJson length:', cookieJson?.length);
      SecureStore.setItem(COOKIE_STORAGE_KEY, cookieJson);

      // Trigger session atom to re-fetch so useSession() in all layouts updates
      (authClient as any).$store.notify('$sessionSignal');

      const sessionResult = await authClient.getSession();
      console.log('[magic-link] getSession result:', sessionResult.data ? 'HAS SESSION' : 'NO SESSION', '| error:', sessionResult.error);
      if (!sessionResult.data) throw new Error('Session not found after verify');

      const user = sessionResult.data.user as any;
      console.log('[magic-link] user.id:', user.id, '| onboardingCompleted:', user.onboardingCompleted);
      identifyUser(user.id, { name: user.name, email: user.email });

      if (!user?.onboardingCompleted) {
        const step = parseInt(user?.onboardingStep ?? '0', 10);
        const nextStep = Math.min(step + 1, 6);
        console.log('[magic-link] navigating to onboarding step', nextStep);
        router.replace(`/(app)/onboarding/step-${nextStep}` as any);
      } else {
        console.log('[magic-link] navigating to discovery');
        router.replace('/(app)/(tabs)/discovery');
      }
    } catch (err) {
      console.error('[magic-link] Verification error:', err);
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
