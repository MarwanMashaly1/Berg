import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../../constants/theme';
import { Button } from '../../../components/ui/Button';
import { OnboardingProgress } from '../../../components/ui/OnboardingProgress';
import { patchUser } from '../../../lib/api';

const C = Colors.light;

export default function Step5() {
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  const shareLink = `https://berg.app/join/me`; // placeholder until invite links built

  async function handleShare() {
    await Share.share({ message: `Join me on Berg ðŸ§Š\n${shareLink}` });
  }

  async function advance() {
    setSaving(true);
    try { await patchUser({ onboardingStep: '5' }); router.push('/(app)/onboarding/step-6'); }
    catch { setSaving(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWarm, paddingTop: insets.top + 20, paddingHorizontal: 28, paddingBottom: insets.bottom + 24 }}>
      <View style={styles.header}><OnboardingProgress currentStep={5} /></View>
      <View style={styles.content}>
        <Text style={styles.heading}>Bring your people</Text>
        <View style={styles.rule} />
        <Text style={styles.sub}>Berg works best with friends. Share your link and they'll connect with you automatically.</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareCard} activeOpacity={0.85}>
          <Text style={styles.shareEmoji}>ðŸ”—</Text>
          <View>
            <Text style={styles.shareTitle}>Share your invite link</Text>
            <Text style={styles.shareUrl}>{shareLink}</Text>
          </View>
        </TouchableOpacity>
      </View>
      <View style={{ gap: 12 }}>
        <Button label="Share & continue" onPress={async () => { await handleShare(); advance(); }} loading={saving} fullWidth size="lg" style={styles.btn} textStyle={{ color: '#fff', fontFamily: Fonts.bodySemiBold }} />
        <TouchableOpacity onPress={advance} style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Text style={{ fontFamily: Fonts.body, fontSize: 14, color: '#b0a090' }}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 32 },
  content: { flex: 1, justifyContent: 'center', paddingBottom: 32 },
  heading: { fontFamily: Fonts.heading, fontSize: 34, color: C.text, lineHeight: 40, letterSpacing: -0.5, marginBottom: 14 },
  rule: { width: 32, height: 2, backgroundColor: C.primary, borderRadius: 2, marginBottom: 14 },
  sub: { fontFamily: Fonts.body, fontSize: 15, color: '#9a8a7a', lineHeight: 22, marginBottom: 28 },
  shareCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: C.border },
  shareEmoji: { fontSize: 28 },
  shareTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: C.text, marginBottom: 2 },
  shareUrl: { fontFamily: Fonts.body, fontSize: 12, color: '#b0a090' },
  btn: { backgroundColor: C.text, borderRadius: 14 },
});
