import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Colors, Fonts } from '../../constants/theme';
import { GrainTexture } from '../../components/ui/GrainTexture';
import { authClient } from '../../lib/auth';

const C = Colors.light;

export default function SignUpScreen() {
  const { error } = useLocalSearchParams<{ error?: string }>();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(
    error === 'link_expired'
      ? 'That link has expired. Enter your email to get a new one.'
      : ''
  );
  const [googleError, setGoogleError] = useState('');
  const [magicLoading, setMagicLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const emailRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  async function handleMagicLink() {
    if (!email.trim() || !email.includes('@')) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setMagicLoading(true);
    setEmailError('');
    try {
      // createURL generates exp://... in Expo Go, icebreak://... in production builds
      const callbackURL = Linking.createURL('magic-link-callback');
      await authClient.signIn.magicLink({
        email: email.trim().toLowerCase(),
        callbackURL,
      });
      router.push({ pathname: '/(auth)/magic-link-sent', params: { email } });
    } catch (err: unknown) {
      setEmailError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setMagicLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setGoogleError('');
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/(app)/(tabs)/discovery',
      });
      router.replace('/(app)/(tabs)/discovery');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message && !message.toLowerCase().includes('cancel')) {
        setGoogleError('Google sign-in failed. Try again or use email.');
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  const anyLoading = magicLoading || googleLoading;

  return (
    <SafeAreaView style={styles.safe}>
      <GrainTexture />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back — inside safe area, proper spacing from top */}
          <TouchableOpacity onPress={() => router.back()} style={styles.back} activeOpacity={0.6}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Content block — vertically centered in remaining space */}
          <View style={styles.centerBlock}>

            {/* Headline */}
            <Text style={styles.headline}>{"Let's get\nyou in."}</Text>
            <View style={styles.accentRule} />

            {/* Email input */}
            <View style={[styles.emailBox, emailError ? styles.emailBoxError : null]}>
              <Text style={styles.emailLabel}>EMAIL ADDRESS</Text>
              <TextInput
                ref={emailRef}
                style={styles.emailInput}
                value={email}
                onChangeText={(t) => { setEmail(t); setEmailError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="you@example.com"
                placeholderTextColor="#c8b8a8"
                returnKeyType="go"
                onSubmitEditing={handleMagicLink}
                editable={!anyLoading}
              />
            </View>

            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

            {/* Send magic link */}
            <TouchableOpacity
              style={[styles.primaryBtn, anyLoading && styles.btnDisabled]}
              onPress={handleMagicLink}
              activeOpacity={0.85}
              disabled={anyLoading}
            >
              {magicLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.primaryBtnText}>Send magic link</Text>
              }
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>prefer Google?</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={[styles.googleBtn, anyLoading && styles.btnDisabled]}
              onPress={handleGoogle}
              activeOpacity={0.8}
              disabled={anyLoading}
            >
              <Text style={styles.googleG}>G</Text>
              <Text style={styles.googleBtnText}>
                {googleLoading ? 'Opening Google…' : 'Continue with Google'}
              </Text>
            </TouchableOpacity>

            {googleError ? (
              <Text style={[styles.errorText, { textAlign: 'center', marginTop: 8, marginBottom: 0 }]}>
                {googleError}
              </Text>
            ) : null}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.backgroundWarm,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  back: {
    paddingTop: 40,
    paddingBottom: 8,
  },
  backText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: '#b0a090',
  },
  // More padding at the bottom shifts content upward, equalising visual space
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 80,
  },
  headline: {
    fontFamily: Fonts.heading,
    fontSize: 34,
    color: C.text,
    lineHeight: 40,
    letterSpacing: -0.5,
    marginBottom: 14,
    textAlign: 'center',
  },
  accentRule: {
    width: 32,
    height: 2,
    backgroundColor: C.primary,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 32,
  },
  emailBox: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: C.text,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
  },
  emailBoxError: {
    borderColor: C.error,
  },
  emailLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 9,
    color: '#b0a090',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  emailInput: {
    fontFamily: Fonts.body,
    fontSize: 16,
    color: C.text,
    padding: 0,
    minHeight: 24,
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.error,
    marginBottom: 12,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: C.text,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 28,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: '#fff',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0d5c8',
  },
  dividerText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: '#c0b0a0',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e0d5c8',
    borderRadius: 14,
    paddingVertical: 14,
  },
  googleG: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: '#4285F4',
  },
  googleBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: '#555',
  },
});
