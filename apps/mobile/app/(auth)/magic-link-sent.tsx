import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { getSetCookie } from '@better-auth/expo/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../constants/theme';
import { authClient } from '../../lib/auth';
import { identifyUser } from '../../lib/analytics';

// Must match the storagePrefix in lib/auth.ts → 'berg' + '_cookie'
const COOKIE_KEY = 'berg_cookie';
const RESEND_COOLDOWN = 30;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const C = Colors.light;

export default function MagicLinkSentScreen() {
  const insets = useSafeAreaInsets();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Auto-focus after a short delay so the keyboard appears smoothly
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function handleResend() {
    if (!email || cooldown > 0) return;
    try {
      const callbackURL = Linking.createURL('magic-link-callback');
      await authClient.signIn.magicLink({ email, callbackURL });
      setCooldown(RESEND_COOLDOWN);
    } catch { /* silent */ }
  }

  async function handleVerify() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 8) {
      setError('Enter the 8-character code from the email.');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      // Step 1: verify the code with our server proxy
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, email }),
      });

      const data = await res.json() as { setCookie?: string; error?: string };

      if (!res.ok || !data.setCookie) {
        setError(data.error ?? 'Invalid or expired code. Request a new one.');
        return;
      }

      // Step 2: store the session cookie
      const prevCookie = SecureStore.getItem(COOKIE_KEY);
      const cookieJson = getSetCookie(data.setCookie, prevCookie ?? undefined);
      SecureStore.setItem(COOKIE_KEY, cookieJson);

      // Step 3: call getSession() — this forces BetterAuth's atom to hydrate
      // with the new session BEFORE we navigate into (app), so AppLayout's
      // useSession() guard never sees a null session on mount.
      const sessionResult = await authClient.getSession();
      if (!sessionResult.data) {
        setError('Session could not be established. Please try again.');
        return;
      }

      const user = sessionResult.data.user as any;
      identifyUser(user.id, { name: user.name ?? '', email: user.email ?? '' });

      if (!user?.onboardingCompleted) {
        const step = parseInt(user?.onboardingStep ?? '0', 10);
        router.replace(`/(app)/onboarding/step-${Math.min(step + 1, 6)}` as any);
      } else {
        router.replace('/(app)/(tabs)/discovery');
      }
    } catch (e) {
      console.error('[verify] error:', e);
      setError('Something went wrong. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  const canVerify = code.trim().length === 8 && !verifying;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.backgroundWarm }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back / close */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace('/(auth)/welcome')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {/* Icon */}
        <View style={styles.iconWrap}>
          <View style={styles.iconEnvelope}>
            <View style={styles.envFlap} />
          </View>
        </View>

        <Text style={styles.headline}>Check your{'\n'}email.</Text>
        <View style={styles.rule} />
        <Text style={styles.body}>
          We sent a magic link to{'\n'}
          <Text style={styles.emailHighlight}>{email}</Text>
          {'\n\n'}
          Enter the 8-letter code from{'\n'}the email to sign in.
        </Text>

        {/* Code input — always visible above keyboard */}
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            style={[styles.codeInput, error ? styles.codeInputError : null]}
            value={code}
            onChangeText={(t) => { setCode(t.toUpperCase()); setError(''); }}
            placeholder="A B C D E F G H"
            placeholderTextColor={C.textTertiary}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="default"
            maxLength={8}
            returnKeyType="go"
            onSubmitEditing={handleVerify}
            editable={!verifying}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {/* Verify CTA */}
        <TouchableOpacity
          style={[styles.verifyBtn, !canVerify && styles.verifyBtnDisabled]}
          onPress={handleVerify}
          disabled={!canVerify}
          activeOpacity={0.85}
        >
          {verifying
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.verifyBtnText}>Sign in</Text>
          }
        </TouchableOpacity>

        {/* Resend */}
        <TouchableOpacity
          onPress={handleResend}
          disabled={cooldown > 0 || !email}
          activeOpacity={0.7}
          style={styles.resendWrap}
        >
          <Text style={styles.resendText}>
            {"Didn't get it? "}
            {cooldown > 0
              ? <Text style={styles.resendMuted}>Resend in {cooldown}s</Text>
              : <Text style={styles.resendLink}>Resend email</Text>
            }
          </Text>
        </TouchableOpacity>

        {/* Expo Go note */}
        {__DEV__ && (
          <Text style={styles.devNote}>
            In Expo Go, tap the link in the email won't open the app.{'\n'}
            Use the 8-letter code above instead.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  backBtn: {
    marginBottom: 32,
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.textTertiary,
  },

  // Icon — envelope drawn with views
  iconWrap: {
    alignSelf: 'center',
    marginBottom: 28,
  },
  iconEnvelope: {
    width: 64, height: 48,
    borderRadius: 10,
    backgroundColor: C.primaryMuted,
    borderWidth: 2,
    borderColor: C.primary,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  envFlap: {
    width: 0, height: 0,
    borderLeftWidth: 32, borderRightWidth: 32, borderTopWidth: 22,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderTopColor: C.primary,
  },

  headline: {
    fontFamily: Fonts.heading,
    fontSize: 34, color: C.text,
    lineHeight: 40, letterSpacing: -0.5,
    marginBottom: 14,
  },
  rule: {
    width: 32, height: 2,
    backgroundColor: C.primary, borderRadius: 2,
    marginBottom: 18,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 15, color: C.textSecondary,
    lineHeight: 24, marginBottom: 28,
  },
  emailHighlight: {
    fontFamily: Fonts.bodySemiBold,
    color: C.text,
  },

  // Code input
  inputWrap: { marginBottom: 14 },
  codeInput: {
    width: '100%',
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.text,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    textAlign: 'center',
    fontFamily: Fonts.bodySemiBold,
    fontSize: 22,
    color: C.text,
    letterSpacing: 8,
    marginBottom: 6,
  },
  codeInputError: {
    borderColor: C.error,
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.error,
    textAlign: 'center',
  },

  // Buttons
  verifyBtn: {
    width: '100%',
    backgroundColor: C.text,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: C.cardShadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  verifyBtnDisabled: { opacity: 0.35 },
  verifyBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    color: C.textInverse,
  },
  resendWrap: { alignItems: 'center', marginBottom: 20 },
  resendText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.textTertiary,
    textAlign: 'center',
  },
  resendLink: {
    fontFamily: Fonts.bodySemiBold,
    color: C.primary,
  },
  resendMuted: {
    fontFamily: Fonts.body,
    color: C.textTertiary,
  },

  // Dev note (only in __DEV__)
  devNote: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 8,
    opacity: 0.7,
  },
});
