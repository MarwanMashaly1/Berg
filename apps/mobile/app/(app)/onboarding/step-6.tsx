import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Fonts } from '../../../constants/theme';
import { Button } from '../../../components/ui/Button';
import { patchUser } from '../../../lib/api';
import { trackOnboardingStep, trackOnboardingCompleted } from '../../../lib/analytics';

export default function Step6() {
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  async function handleFinish() {
    setSaving(true);
    try {
      await patchUser({ onboardingCompleted: true, onboardingStep: '6' });
      trackOnboardingStep(6);
      trackOnboardingCompleted();
      router.replace('/(app)/(tabs)/discovery');
    } catch { setSaving(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWarm, paddingTop: insets.top + 20, paddingHorizontal: 28, paddingBottom: insets.bottom + 24 }}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🧊</Text>
        <Text style={styles.heading}>You're in.</Text>
        <View style={styles.rule} />
        <Text style={styles.sub}>
          Berg is about real plans with real people.{'\n\n'}
          Answer today's prompt and see who in your circle thinks the same.
        </Text>
      </View>
      <Button
        label="Let's go"
        onPress={handleFinish}
        loading={saving}
        fullWidth
        size="lg"
        style={styles.btn}
        textStyle={{ color: '#fff', fontFamily: Fonts.bodySemiBold }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 },
  emoji: { fontSize: 56, marginBottom: 24 },
  heading: { fontFamily: Fonts.heading, fontSize: 44, fontStyle: 'italic', color: C.text, textAlign: 'center', marginBottom: 16, letterSpacing: -1 },
  rule: { width: 40, height: 3, backgroundColor: C.primary, borderRadius: 2, marginBottom: 20 },
  sub: { fontFamily: Fonts.body, fontSize: 16, color: C.textSecondary, lineHeight: 26, textAlign: 'center', maxWidth: 280 },
  btn: { backgroundColor: C.text, borderRadius: 14 },
});
