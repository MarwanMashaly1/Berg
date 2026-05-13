import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../../constants/theme';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OnboardingProgress } from '../../../components/ui/OnboardingProgress';
import { patchUser } from '../../../lib/api';

const C = Colors.light;
const PROMPTS = ['Your most niche interest?', "A skill you're quietly proud of?", 'Something you\'re always up to talk about?'];

export default function Step3() {
  const [answers, setAnswers] = useState(['', '', '']);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  // Reset loading state if user navigates back to this screen
  useFocusEffect(useCallback(() => { setSaving(false); }, []));

  function setAnswer(i: number, val: string) {
    setAnswers((prev) => { const next = [...prev]; next[i] = val; return next; });
  }

  async function advance(skip = false) {
    setSaving(true);
    try {
      const bio = skip ? undefined : answers.filter(Boolean).join(' · ') || undefined;
      await patchUser({ ...(bio ? { bio } : {}), onboardingStep: '3' });
      router.push('/(app)/onboarding/step-4');
    } catch { setSaving(false); }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.backgroundWarm }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 28,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <OnboardingProgress currentStep={3} />
        </View>
        <View style={styles.content}>
          <Text style={styles.heading}>Ask me about…</Text>
          <View style={styles.rule} />
          <Text style={styles.sub}>Give people a reason to start a conversation. (Optional)</Text>
          <View style={{ gap: 12, marginTop: 28 }}>
            {PROMPTS.map((p, i) => (
              <Input key={i} label={p} value={answers[i]} onChangeText={(t) => setAnswer(i, t)} placeholder="Type something…" returnKeyType="next" />
            ))}
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Button label="Next" onPress={() => advance(false)} loading={saving} fullWidth size="lg" style={styles.btn} textStyle={{ color: '#fff', fontFamily: Fonts.bodySemiBold }} />
          <TouchableOpacity onPress={() => advance(true)} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ fontFamily: Fonts.body, fontSize: 14, color: C.textTertiary }}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 32 },
  content: { flex: 1, paddingBottom: 32 },
  heading: { fontFamily: Fonts.heading, fontSize: 34, fontStyle: 'italic', color: C.text, lineHeight: 40, letterSpacing: -0.5, marginBottom: 14 },
  rule: { width: 32, height: 2, backgroundColor: C.primary, borderRadius: 2, marginBottom: 14 },
  sub: { fontFamily: Fonts.body, fontSize: 15, color: C.textSecondary, lineHeight: 22 },
  btn: { backgroundColor: C.text, borderRadius: 14 },
});
