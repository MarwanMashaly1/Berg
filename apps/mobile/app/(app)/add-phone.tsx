import { useState } from 'react';
import {
  View, Text, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../constants/theme';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { BackButton } from '../../components/ui/BackButton';
import { apiFetch } from '../../lib/api';

const C = Colors.light;

export default function AddPhoneScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    const trimmed = phone.replace(/\D/g, '');
    if (!trimmed) { setError('Enter a valid phone number'); return; }
    setSaving(true);
    setError('');
    try {
      const fullPhone = `${countryCode}${trimmed}`;
      const { sessionId } = await apiFetch<{ sessionId: string }>('/api/phone/start', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: fullPhone }),
      });
      await apiFetch('/api/phone/link', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });
      setDone(true);
      setTimeout(() => router.back(), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.backgroundWarm }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 28,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <BackButton variant="light" />
        </View>

        <View style={styles.content}>
          <Text style={styles.heading}>Add your number</Text>
          <View style={styles.rule} />
          <Text style={styles.sub}>
            Friends who have your number will find you automatically. We never share it or send SMS.
          </Text>

          {done ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>Phone number saved!</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 28 }}>
              <Input
                label="Code"
                value={countryCode}
                onChangeText={setCountryCode}
                keyboardType="phone-pad"
                containerStyle={{ width: 80 }}
                maxLength={4}
              />
              <Input
                label="Phone number"
                value={phone}
                onChangeText={(t) => { setPhone(t); setError(''); }}
                keyboardType="phone-pad"
                placeholder="(555) 000-0000"
                error={error}
                containerStyle={{ flex: 1 }}
              />
            </View>
          )}
        </View>

        {!done && (
          <Button
            label="Save number"
            onPress={handleSubmit}
            loading={saving}
            fullWidth
            size="lg"
            style={styles.btn}
            textStyle={{ color: '#fff', fontFamily: Fonts.bodySemiBold }}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 28 },
  content: { flex: 1, paddingBottom: 32 },
  heading: {
    fontFamily: Fonts.heading, fontSize: 34, fontStyle: 'italic',
    color: C.text, lineHeight: 40, letterSpacing: -0.5, marginBottom: 14,
  },
  rule: { width: 32, height: 2, backgroundColor: C.primary, borderRadius: 2, marginBottom: 14 },
  sub: { fontFamily: Fonts.body, fontSize: 15, color: C.textSecondary, lineHeight: 22 },
  btn: { backgroundColor: C.text, borderRadius: 14 },
  successBox: {
    marginTop: 28, backgroundColor: 'rgba(45,106,79,0.1)',
    borderRadius: 12, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(45,106,79,0.25)',
  },
  successText: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: C.success },
});
