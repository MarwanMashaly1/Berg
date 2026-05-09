import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../../constants/theme';
import { Button } from '../../../components/ui/Button';
import { OnboardingProgress } from '../../../components/ui/OnboardingProgress';
import { getVibeTags, postUserVibeTags, patchUser } from '../../../lib/api';

const C = Colors.light;

type VibeTag = { id: string; label: string; emoji: string; category: string };

export default function Step2() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [tags, setTags] = useState<VibeTag[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    getVibeTags().then((r) => { setTags(r.tags); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const categories = [...new Set(tags.map((t) => t.category))];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleNext() {
    if (selected.size < 3) return;
    setSaving(true);
    try {
      await postUserVibeTags([...selected]);
      await patchUser({ onboardingStep: '2' });
      if (returnTo === 'profile') {
        router.replace('/(app)/(tabs)/profile' as any);
      } else {
        router.push('/(app)/onboarding/step-3');
      }
    } catch {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundWarm }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 28, paddingBottom: 8 }}>
        <OnboardingProgress currentStep={2} />
      </View>

      <View style={{ paddingHorizontal: 28, paddingBottom: 12 }}>
        <Text style={styles.heading}>What are you into?</Text>
        <View style={styles.rule} />
        <Text style={styles.sub}>Pick at least 3 — these power your matches.</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {categories.map((cat) => (
            <View key={cat} style={styles.section}>
              <Text style={styles.catLabel}>{cat.toUpperCase()}</Text>
              <View style={styles.tagRow}>
                {tags.filter((t) => t.category === cat).map((tag) => {
                  const active = selected.has(tag.id);
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      onPress={() => toggle(tag.id)}
                      style={[styles.tag, active && styles.tagActive]}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.tagEmoji}>{tag.emoji}</Text>
                      <Text style={[styles.tagLabel, active && styles.tagLabelActive]}>{tag.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.count}>{selected.size} selected{selected.size < 3 ? ` (${3 - selected.size} more to go)` : ''}</Text>
        <Button
          label="Next"
          onPress={handleNext}
          loading={saving}
          disabled={selected.size < 3}
          fullWidth
          size="lg"
          style={selected.size < 3 ? { ...styles.btn, opacity: 0.5 } : styles.btn}
          textStyle={{ color: '#fff', fontFamily: Fonts.bodySemiBold }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: Fonts.heading, fontSize: 32, fontStyle: 'italic', color: C.text, lineHeight: 38, letterSpacing: -0.5, marginBottom: 12 },
  rule: { width: 32, height: 2, backgroundColor: C.primary, borderRadius: 2, marginBottom: 12 },
  sub: { fontFamily: Fonts.body, fontSize: 14, color: C.textSecondary },
  scroll: { paddingHorizontal: 28, paddingTop: 8 },
  section: { marginBottom: 20 },
  catLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textTertiary, letterSpacing: 0.8, marginBottom: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  tagActive: { backgroundColor: C.primary, borderColor: C.primary },
  tagEmoji: { fontSize: 14 },
  tagLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.text },
  tagLabelActive: { color: C.textInverse },
  bottomBar: { paddingHorizontal: 28, paddingTop: 12, backgroundColor: C.backgroundWarm, gap: 8 },
  count: { fontFamily: Fonts.body, fontSize: 12, color: C.textTertiary, textAlign: 'center' },
  btn: { backgroundColor: C.text, borderRadius: 14 },
});
