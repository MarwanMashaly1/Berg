import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, Share, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../../../constants/theme';
import { createCircle } from '../../../../lib/api';
import { CATEGORIES } from '../../../../constants/motives';

const C = Colors.light;

// Emoji picker: category emojis first, then extras for non-category circles
const CAT_EMOJIS = CATEGORIES.map((c) => c.emoji);
const EXTRA_EMOJIS = ['👥', '📚', '🎵', '⚽', '🏋️', '🌿', '🐶', '💻', '🎯', '🌊', '🏔️'];
const EMOJI_OPTIONS = [...CAT_EMOJIS, ...EXTRA_EMOJIS];

// Color swatches derived from category colors (light pastel tints)
const CIRCLE_COLORS = [
  '#FFE8DC', // food orange
  '#D8F4E8', // outdoors green
  '#F4E8D4', // catchup warm
  '#DDE6F8', // movies blue
  '#CCF4F0', // active teal
  '#F8D4E4', // party pink
  '#E4DCF4', // gaming purple
  '#D4ECF8', // travel sky
  '#F8E4D4', // creative amber
  '#EFF0F0', // neutral
];

export default function CreateCircleScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  // Step 0: name + description
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Step 1: emoji + color
  const [emoji, setEmoji] = useState(CATEGORIES[0].emoji);
  const [color, setColor] = useState(CIRCLE_COLORS[0]);

  // Step 2: privacy settings
  const [isPublic, setIsPublic] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Step 3: share code
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    setCreating(true);
    setError('');
    try {
      const result = await createCircle({
        name: name.trim(),
        description: description.trim() || undefined,
        categoryEmoji: emoji,
        categoryColor: color,
        isPublic,
        requiresApproval,
      });
      setCreatedId(result.id);
      setJoinCode(result.joinCode);
      setStep(3);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  async function handleShare() {
    if (!joinCode || !name) return;
    await Share.share({ message: `Join ${name} on Berg! Use code: ${joinCode}` });
  }

  const steps = ['Name', 'Look', 'Settings', 'Share'];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (step > 0 && step < 3 ? setStep(step - 1) : router.back())}>
            <Text style={styles.backBtn}>{step === 3 ? '✕ Close' : '← Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Create a circle</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          {steps.map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
                <Text style={[styles.stepDotText, i <= step && styles.stepDotTextActive]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{s}</Text>
            </View>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Step 0: Name + Description ── */}
          {step === 0 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepHeading}>What's your circle called?</Text>
              <Text style={styles.stepSub}>Choose a name that reflects who the group is for.</Text>

              <Text style={styles.fieldLabel}>Circle name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. UCL Running Club"
                placeholderTextColor={C.textTertiary}
                maxLength={60}
                autoFocus
              />

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="What's this circle about? Who should join?"
                placeholderTextColor={C.textTertiary}
                multiline
                numberOfLines={3}
                maxLength={200}
              />

              <TouchableOpacity
                style={[styles.nextBtn, !name.trim() && styles.nextBtnDisabled]}
                onPress={() => setStep(1)}
                disabled={!name.trim()}
              >
                <Text style={styles.nextBtnText}>Next →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 1: Emoji + Color ── */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepHeading}>Give it a look</Text>
              <Text style={styles.stepSub}>Pick an emoji and color that represent your circle.</Text>

              {/* Preview */}
              <View style={[styles.preview, { backgroundColor: color }]}>
                <Text style={styles.previewEmoji}>{emoji}</Text>
                <Text style={styles.previewName}>{name}</Text>
              </View>

              <Text style={styles.fieldLabel}>Emoji</Text>
              <View style={styles.emojiGrid}>
                {EMOJI_OPTIONS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
                    onPress={() => setEmoji(e)}
                  >
                    <Text style={styles.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.colorRow}>
                {CIRCLE_COLORS.map((col) => (
                  <TouchableOpacity
                    key={col}
                    style={[styles.colorSwatch, { backgroundColor: col }, color === col && styles.colorSwatchActive]}
                    onPress={() => setColor(col)}
                  />
                ))}
              </View>

              <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(2)}>
                <Text style={styles.nextBtnText}>Next →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 2: Privacy ── */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepHeading}>Privacy settings</Text>
              <Text style={styles.stepSub}>Control who can find and join your circle.</Text>

              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>Public circle</Text>
                  <Text style={styles.settingDesc}>
                    {isPublic
                      ? 'Anyone can discover this circle in the app'
                      : 'Only people with the join code can find this circle'}
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor={C.surface}
                />
              </View>

              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingTitle}>Require approval</Text>
                  <Text style={styles.settingDesc}>
                    {requiresApproval
                      ? 'You review and approve every join request'
                      : 'Anyone can join instantly with the code'}
                  </Text>
                </View>
                <Switch
                  value={requiresApproval}
                  onValueChange={setRequiresApproval}
                  trackColor={{ false: C.border, true: C.primary }}
                  thumbColor={C.surface}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.nextBtn, creating && styles.nextBtnDisabled]}
                onPress={handleCreate}
                disabled={creating}
              >
                <Text style={styles.nextBtnText}>{creating ? 'Creating…' : 'Create circle ✦'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 3: Share ── */}
          {step === 3 && joinCode && (
            <View style={styles.stepContent}>
              <View style={[styles.successHero, { backgroundColor: color }]}>
                <Text style={styles.successEmoji}>{emoji}</Text>
                <Text style={styles.successBadge}>CIRCLE CREATED ✦</Text>
                <Text style={styles.successName}>{name}</Text>
              </View>

              <Text style={styles.sharePrompt}>Share the join code so people can find your circle</Text>

              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>JOIN CODE</Text>
                <Text style={styles.codeValue}>{joinCode}</Text>
              </View>

              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <Text style={styles.shareBtnText}>Share invite ↗</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.viewCircleBtn}
                onPress={() => {
                  router.replace({
                    pathname: '/(app)/(tabs)/profile/circle-detail',
                    params: { id: createdId! },
                  } as any);
                }}
              >
                <Text style={styles.viewCircleBtnText}>View circle →</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 8,
  },
  backBtn: { fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary, width: 60 },
  title: { fontFamily: Fonts.heading, fontSize: 16, color: C.text },
  stepRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingHorizontal: 18, marginBottom: 8 },
  stepItem: { alignItems: 'center', gap: 3 },
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: C.primary },
  stepDotText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textTertiary },
  stepDotTextActive: { color: C.textInverse },
  stepLabel: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary },
  stepLabelActive: { color: C.primary, fontFamily: Fonts.bodySemiBold },
  body: { paddingHorizontal: 18, paddingTop: 8 },
  stepContent: { gap: 12 },
  stepHeading: { fontFamily: Fonts.heading, fontSize: 20, color: C.text, marginBottom: 2 },
  stepSub: { fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary, lineHeight: 19, marginBottom: 8 },
  fieldLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textSecondary },
  input: {
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    padding: 12, fontFamily: Fonts.body, fontSize: 14, color: C.text,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  nextBtn: { backgroundColor: C.primary, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 8 },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.textInverse },
  preview: { borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 8 },
  previewEmoji: { fontSize: 44, marginBottom: 6 },
  previewName: { fontFamily: Fonts.heading, fontSize: 17, color: C.text, textAlign: 'center' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  emojiBtnActive: { borderColor: C.primary, backgroundColor: C.primaryMuted },
  emojiText: { fontSize: 22 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorSwatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: C.primary },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1,
    borderColor: C.border, padding: 14,
  },
  settingTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.text, marginBottom: 2 },
  settingDesc: { fontFamily: Fonts.body, fontSize: 11, color: C.textSecondary, lineHeight: 16 },
  errorText: { fontFamily: Fonts.body, fontSize: 12, color: C.error, textAlign: 'center' },
  successHero: { borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 8 },
  successEmoji: { fontSize: 56, marginBottom: 8 },
  successBadge: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.primary, letterSpacing: 0.4, marginBottom: 6 },
  successName: { fontFamily: Fonts.heading, fontSize: 20, color: C.text, textAlign: 'center' },
  sharePrompt: { fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 19 },
  codeCard: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1,
    borderColor: C.border, padding: 20, alignItems: 'center',
  },
  codeLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textTertiary, letterSpacing: 0.5, marginBottom: 4 },
  codeValue: { fontFamily: Fonts.bodySemiBold, fontSize: 32, color: C.text, letterSpacing: 6 },
  shareBtn: { backgroundColor: C.primary, borderRadius: 14, padding: 14, alignItems: 'center' },
  shareBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.textInverse },
  viewCircleBtn: { borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1.5, borderColor: C.border },
  viewCircleBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.textSecondary },
});
