import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';

let Contacts: typeof import('expo-contacts') | null = null;
try { Contacts = require('expo-contacts'); } catch { /* native module unavailable */ }
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Fonts } from '../../../constants/theme';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OnboardingProgress } from '../../../components/ui/OnboardingProgress';
import { apiFetch, patchUser } from '../../../lib/api';
import { log } from '../../../lib/logger';
import { trackOnboardingStep } from '../../../lib/analytics';

export default function Step4() {
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();

  async function handleSubmit() {
    const trimmed = phone.replace(/\D/g, '');
    if (!trimmed) { setError('Enter a valid phone number'); return; }
    setSaving(true);
    setError('');
    try {
      const fullPhone = `${countryCode}${trimmed}`;
      const { sessionId } = await apiFetch<{ sessionId: string }>('/api/phone/start', { method: 'POST', body: JSON.stringify({ phoneNumber: fullPhone }) });
      await apiFetch('/api/phone/link', { method: 'POST', body: JSON.stringify({ sessionId }) });
      await patchUser({ onboardingStep: '4' });
      trackOnboardingStep(4);
      // Request contacts permission now that user has a phone number — best time to ask
      if (Contacts) await Contacts.requestPermissionsAsync().catch(() => {});
      router.push('/(app)/onboarding/step-5');
    } catch (err: unknown) {
      log.error('onboarding step-4 save failed', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
      Alert.alert('Something went wrong', 'Please try again.');
    } finally { setSaving(false); }
  }

  async function skip() {
    setSaving(true);
    try { await patchUser({ onboardingStep: '4' }); trackOnboardingStep(4); router.push('/(app)/onboarding/step-5'); }
    catch (err) { log.error('onboarding step-4 skip failed', err); Alert.alert('Something went wrong', 'Please try again.'); setSaving(false); }
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
        <View style={styles.header}><OnboardingProgress currentStep={4} /></View>
        <View style={styles.content}>
          <Text style={styles.heading}>Add your number</Text>
          <View style={styles.rule} />
          <Text style={styles.sub}>Friends who have your number will find you automatically. We never share it or send SMS.</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 28 }}>
            <Input label="Code" value={countryCode} onChangeText={setCountryCode} keyboardType="phone-pad" containerStyle={{ width: 80 }} maxLength={4} />
            <Input label="Phone number" value={phone} onChangeText={(t) => { setPhone(t); setError(''); }} keyboardType="phone-pad" placeholder="(555) 000-0000" error={error} containerStyle={{ flex: 1 }} />
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Button label="Add number" onPress={handleSubmit} loading={saving} fullWidth size="lg" style={styles.btn} textStyle={{ color: '#fff', fontFamily: Fonts.bodySemiBold }} />
          <TouchableOpacity onPress={skip} style={{ alignItems: 'center', paddingVertical: 8 }}>
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
