import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, Alert, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { C, Fonts } from '../../../../constants/theme';
import { getCircleDetail, updateCircle, uploadCircleImage, CircleDetail } from '../../../../lib/api';
import { CATEGORIES } from '../../../../constants/motives';

const CAT_EMOJIS = CATEGORIES.map((c) => c.emoji);
const EXTRA_EMOJIS = ['👥', '📚', '🎵', '⚽', '🏋️', '🌿', '🐶', '💻', '🎯', '🌊', '🏔️'];
const EMOJI_OPTIONS = [...new Set([...CAT_EMOJIS, ...EXTRA_EMOJIS])];

const CIRCLE_COLORS = [
  '#FFE8DC', '#D8F4E8', '#F4E8D4', '#DDE6F8', '#CCF4F0',
  '#F8D4E4', '#E4DCF4', '#D4ECF8', '#F8E4D4', '#EFF0F0',
];

export default function EditCircleScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('👥');
  const [color, setColor] = useState(CIRCLE_COLORS[0]);
  const [isPublic, setIsPublic] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [coverImage, setCoverImage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getCircleDetail(id)
      .then(({ circle }) => {
        setName(circle.name);
        setDescription(circle.description ?? '');
        setEmoji(circle.categoryEmoji);
        setColor(circle.categoryColor);
        setIsPublic(circle.isPublic);
        setRequiresApproval(circle.requiresApproval);
        setCoverImage(circle.coverImage ?? null);
      })
      .catch(() => Alert.alert('Error', 'Could not load circle details'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const { imageUrl } = await uploadCircleImage(
        id!,
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
      );
      setCoverImage(imageUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload image');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateCircle(id!, {
        name: name.trim(),
        description: description.trim() || undefined,
        categoryEmoji: emoji,
        categoryColor: color,
        isPublic,
        requiresApproval,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit circle</Text>
          <View style={{ width: 60 }} />
        </View>
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit circle</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving || !name.trim()}>
            <Text style={[styles.save, (!name.trim() || saving) && { opacity: 0.4 }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cover image */}
          <TouchableOpacity style={styles.coverWrap} onPress={handlePickImage} activeOpacity={0.8}>
            {coverImage ? (
              <Image source={{ uri: coverImage }} style={styles.coverImage} />
            ) : (
              <View style={[styles.coverPlaceholder, { backgroundColor: color }]}>
                <Text style={styles.coverEmoji}>{emoji}</Text>
              </View>
            )}
            <View style={styles.coverEditBadge}>
              {uploadingImage ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialIcons name="photo-camera" size={16} color="#fff" />
              )}
            </View>
          </TouchableOpacity>

          {/* Name */}
          <Text style={styles.label}>Circle name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. UCL Running Club"
            placeholderTextColor={C.textTertiary}
            maxLength={60}
          />

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's this circle about?"
            placeholderTextColor={C.textTertiary}
            multiline
            numberOfLines={3}
            maxLength={200}
            textAlignVertical="top"
          />

          {/* Emoji */}
          <Text style={styles.label}>Emoji</Text>
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

          {/* Color */}
          <Text style={styles.label}>Color</Text>
          <View style={styles.colorRow}>
            {CIRCLE_COLORS.map((col) => (
              <TouchableOpacity
                key={col}
                style={[styles.colorSwatch, { backgroundColor: col }, color === col && styles.colorSwatchActive]}
                onPress={() => setColor(col)}
              />
            ))}
          </View>

          {/* Preview */}
          <View style={[styles.preview, { backgroundColor: color }]}>
            <Text style={styles.previewEmoji}>{emoji}</Text>
            <Text style={styles.previewName}>{name || 'Circle name'}</Text>
          </View>

          {/* Privacy */}
          <Text style={styles.sectionTitle}>Privacy</Text>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Public circle</Text>
              <Text style={styles.settingDesc}>
                {isPublic ? 'Discoverable in the app' : 'Only via join code'}
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
                {requiresApproval ? 'You approve every join request' : 'Anyone joins instantly'}
              </Text>
            </View>
            <Switch
              value={requiresApproval}
              onValueChange={setRequiresApproval}
              trackColor={{ false: C.border, true: C.primary }}
              thumbColor={C.surface}
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.backgroundWarm },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 12,
  },
  cancel: { fontFamily: Fonts.body, fontSize: 15, color: C.textSecondary, width: 60 },
  title: { fontFamily: Fonts.heading, fontSize: 17, color: C.text },
  save: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: C.primary, width: 60, textAlign: 'right' },
  body: { paddingHorizontal: 18, paddingTop: 4, gap: 10 },

  coverWrap: { position: 'relative', marginBottom: 4 },
  coverImage: { width: '100%', height: 160, borderRadius: 16 },
  coverPlaceholder: {
    width: '100%', height: 160, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  coverEmoji: { fontSize: 52 },
  coverEditBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },

  label: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textSecondary, letterSpacing: 0.3 },
  input: {
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1.5, borderColor: C.border,
    paddingHorizontal: 13, paddingVertical: 13, fontFamily: Fonts.body, fontSize: 15, color: C.text,
  },
  textArea: { height: 90 },

  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  emojiBtnActive: { borderColor: C.primary, backgroundColor: C.primaryMuted },
  emojiText: { fontSize: 22 },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorSwatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActive: { borderColor: C.primary },

  preview: { borderRadius: 16, padding: 20, alignItems: 'center' },
  previewEmoji: { fontSize: 40, marginBottom: 6 },
  previewName: { fontFamily: Fonts.heading, fontSize: 16, color: C.text, textAlign: 'center' },

  sectionTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.text, marginTop: 8 },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1,
    borderColor: C.border, padding: 14,
  },
  settingTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.text, marginBottom: 2 },
  settingDesc: { fontFamily: Fonts.body, fontSize: 11, color: C.textSecondary, lineHeight: 16 },
});
