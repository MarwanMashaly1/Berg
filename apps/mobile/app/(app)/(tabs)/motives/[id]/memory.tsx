import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  FadeInRight,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, Shadow } from '../../../../../constants/theme';
import { CATEGORY_MAP } from '../../../../../constants/motives';
import { Avatar } from '../../../../../components/ui/Avatar';
import { BackButton } from '../../../../../components/ui/BackButton';
import {
  getMotive,
  saveMemoryMeta,
  getMemoryUploadUrl,
  confirmMemoryUpload,
  deleteMemoryPhoto,
  Motive,
} from '../../../../../lib/api';

const C = Colors.light;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Vibe tags ────────────────────────────────────────────────────────────────

type VibeTag = { label: string; emoji: string; categories?: string[] };

const VIBE_TAGS: VibeTag[] = [
  { label: 'Legendary',           emoji: '🔥' },
  { label: 'Too funny',           emoji: '😂' },
  { label: 'Deep convos',         emoji: '💬' },
  { label: 'Good music',          emoji: '🎵' },
  { label: 'Chill',               emoji: '😌' },
  { label: 'Wholesome',           emoji: '🥰' },
  { label: 'Late one',            emoji: '🌙' },
  { label: 'Spontaneous',         emoji: '⚡' },
  { label: 'Overdue',             emoji: '⏰' },
  { label: 'Needed this',         emoji: '✨' },
  { label: 'Great food',          emoji: '🍴', categories: ['food'] },
  { label: 'Perfect spot',        emoji: '📍', categories: ['food'] },
  { label: 'Tried something new', emoji: '🆕', categories: ['food'] },
  { label: 'Fresh air',           emoji: '🌬️', categories: ['outdoors'] },
  { label: 'We went too far',     emoji: '😅', categories: ['outdoors'] },
  { label: 'Worth every step',    emoji: '🏔️', categories: ['outdoors'] },
];

function getTagsForCategory(category: string): VibeTag[] {
  return VIBE_TAGS.filter(t => !t.categories || t.categories.includes(category));
}

// ─── Rating data ──────────────────────────────────────────────────────────────

const RATINGS = [
  { value: 1, emoji: '😬', label: 'Rough' },
  { value: 2, emoji: '😐', label: 'Meh' },
  { value: 3, emoji: '🙂', label: 'Good' },
  { value: 4, emoji: '😄', label: 'Great' },
  { value: 5, emoji: '🔥', label: 'Iconic' },
];

// ─── Orange CTA ───────────────────────────────────────────────────────────────

function OrangeCta({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.ctaBtn, disabled && styles.ctaBtnDisabled]}
    >
      <Text style={styles.ctaText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Step 1 — Vibe Tags ───────────────────────────────────────────────────────

function Step1Vibe({
  category,
  selected,
  onToggle,
}: {
  category: string;
  selected: string[];
  onToggle: (label: string) => void;
}) {
  const tags = getTagsForCategory(category);

  return (
    <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepHeading}>How was it?</Text>
      <Text style={styles.stepSub}>Optional — pick any that fit</Text>

      {selected.length > 0 && (
        <View style={styles.counterRow}>
          <Text style={styles.counterTextMet}>{selected.length} selected</Text>
          <Text style={styles.counterCheck}>✓</Text>
        </View>
      )}

      <View style={styles.tagsWrap}>
        {tags.map(tag => {
          const sel = selected.includes(tag.label);
          return (
            <TouchableOpacity
              key={tag.label}
              onPress={() => onToggle(tag.label)}
              activeOpacity={0.75}
              style={[styles.tagPill, sel && styles.tagPillSelected]}
            >
              <Text style={styles.tagEmoji}>{tag.emoji}</Text>
              <Text style={[styles.tagLabel, sel && styles.tagLabelSelected]}>{tag.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Step 2 — Photos ─────────────────────────────────────────────────────────

type UploadedPhoto = { localUri: string; path: string };

function Step2Photos({
  photos,
  uploading,
  onAdd,
  onRemove,
}: {
  photos: UploadedPhoto[];
  uploading: boolean;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}) {
  const slotSize = (SCREEN_WIDTH - 48) / 3;
  const MAX = 10;
  const slots = Array.from({ length: MAX });

  return (
    <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepHeading}>Add some photos</Text>
      <Text style={styles.stepSub}>Optional — up to {MAX}</Text>

      <View style={styles.photoGrid}>
        {slots.map((_, i) => {
          const photo = photos[i];
          if (photo) {
            return (
              <View key={i} style={[styles.photoSlotFilled, { width: slotSize, height: slotSize }]}>
                <Image source={{ uri: photo.localUri }} style={StyleSheet.absoluteFill} />
                <TouchableOpacity onPress={() => onRemove(i)} style={styles.photoRemove}>
                  {/* X drawn with Views */}
                  <View style={styles.xLine1} />
                  <View style={styles.xLine2} />
                </TouchableOpacity>
              </View>
            );
          }
          const isNext = i === photos.length;
          return (
            <TouchableOpacity
              key={i}
              onPress={isNext ? onAdd : undefined}
              style={[styles.photoSlotEmpty, { width: slotSize, height: slotSize }, !isNext && styles.photoSlotLocked]}
              activeOpacity={isNext ? 0.7 : 1}
            >
              {isNext && uploading ? (
                <ActivityIndicator color={C.primary} size="small" />
              ) : isNext ? (
                <>
                  <View style={styles.plusH} />
                  <View style={styles.plusV} />
                </>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Animated rating emoji ────────────────────────────────────────────────────

function RatingEmoji({
  rating: r,
  selected: sel,
  onPress,
}: {
  rating: { value: number; emoji: string; label: string };
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function handlePress() {
    scale.value = withSpring(1.35, { damping: 8, stiffness: 280 }, () => {
      scale.value = withSpring(sel ? 1 : 1.15, { damping: 12, stiffness: 300 });
    });
    onPress();
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={styles.ratingItem}>
      <Animated.Text
        style={[
          styles.ratingEmoji,
          animStyle,
          sel ? { fontSize: 44, opacity: 1 } : { fontSize: 32, opacity: 0.3 },
        ]}
      >
        {r.emoji}
      </Animated.Text>
      {sel && <Text style={styles.ratingLabel}>{r.label}</Text>}
    </TouchableOpacity>
  );
}

// ─── Step 3 — Rating ─────────────────────────────────────────────────────────

function Step3Rating({
  rating,
  setRating,
  venueRating,
  setVenueRating,
  placeName,
}: {
  rating: number;
  setRating: (v: number) => void;
  venueRating: number;
  setVenueRating: (v: number) => void;
  placeName: string | null;
}) {
  return (
    <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepHeading}>Would you do this again?</Text>

      <View style={styles.ratingRow}>
        {RATINGS.map(r => (
          <RatingEmoji
            key={r.value}
            rating={r}
            selected={rating === r.value}
            onPress={() => setRating(r.value)}
          />
        ))}
      </View>

      {placeName && (
        <View style={styles.venueCard}>
          <Text style={styles.venueEyebrow}>VENUE</Text>
          <Text style={styles.venueName}>{placeName}</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(s => (
              <TouchableOpacity key={s} onPress={() => setVenueRating(s)}>
                <Text style={[styles.star, s <= venueRating && styles.starFilled]}>
                  {s <= venueRating ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Step 4 — Memory Card ─────────────────────────────────────────────────────

function Step4Card({
  motive,
  photos,
  selectedTags,
  onSave,
  saving,
}: {
  motive: Motive;
  photos: UploadedPhoto[];
  selectedTags: string[];
  onSave: () => void;
  saving: boolean;
}) {
  const now = new Date();
  const monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const catLabel = CATEGORY_MAP[motive.category as keyof typeof CATEGORY_MAP]?.label ?? motive.category;
  const tagLine = selectedTags.slice(0, 3).join(' · ');
  const visibleAtt = (motive.attendees ?? []).slice(0, 4);
  const overflow = (motive.attendees ?? []).length - 4;

  return (
    <ScrollView style={styles.stepScroll} contentContainerStyle={[styles.stepContent, { alignItems: 'center' }]} showsVerticalScrollIndicator={false}>
      <Text style={styles.cardEyebrow}>MEMORY CARD</Text>

      <View style={styles.memCard}>
        <View style={[styles.memCardBand, { backgroundColor: C.primary }]} />
        <View style={styles.memCardBody}>
          <Text style={styles.memCardMeta}>{catLabel.toUpperCase()} · {monthYear.toUpperCase()}</Text>
          <Text style={styles.memCardTitle}>{motive.title}</Text>

          <View style={styles.memAvatarRow}>
            {visibleAtt.map((a, i) => (
              <View key={a.userId} style={{ marginLeft: i > 0 ? -6 : 0 }}>
                <Avatar name={a.name} userId={a.userId} size="xs" />
              </View>
            ))}
            {overflow > 0 && (
              <View style={styles.memOverflow}>
                <Text style={styles.memOverflowText}>+{overflow}</Text>
              </View>
            )}
          </View>

          <View style={styles.memPhotos}>
            {[0, 1, 2].map(i => (
              photos[i] ? (
                <Image key={i} source={{ uri: photos[i].localUri }} style={[styles.memPhotoSlot, { borderRadius: 6 }]} />
              ) : (
                <View key={i} style={[styles.memPhotoSlot, { backgroundColor: C.border }]} />
              )
            ))}
          </View>

          {tagLine.length > 0 && <Text style={styles.memTags}>{tagLine}</Text>}
          <Text style={styles.memWatermark}>Berg</Text>
        </View>
      </View>

      <OrangeCta label={saving ? 'Saving...' : 'Save & Share'} onPress={onSave} disabled={saving} />

      <TouchableOpacity
        onPress={() => router.push(`/(app)/(tabs)/motives/${motive.id}/memories` as any)}
        style={styles.galleryLink}
      >
        <Text style={styles.galleryLinkText}>View shared memories →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [motive, setMotive] = useState<Motive | null>(null);
  const [step, setStep] = useState(1);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [rating, setRating] = useState(0);
  const [venueRating, setVenueRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const progressWidth = useSharedValue(25);

  useEffect(() => {
    if (!id) return;
    getMotive(id).then(res => setMotive(res.motive)).catch(() => {});
  }, [id]);

  useEffect(() => {
    progressWidth.value = withTiming((step / 4) * 100, { duration: 350 });
  }, [step]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  function toggleTag(label: string) {
    setSelectedTags(prev =>
      prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]
    );
  }

  async function handleAddPhoto() {
    if (uploading || photos.length >= 10 || !id) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add memories.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';

    setUploading(true);
    try {
      // 1. Get signed upload URL from our API
      const { uploadUrl, path } = await getMemoryUploadUrl(id, mimeType, ext);

      // 2. Read local file as blob and PUT directly to the signed URL.
      //    We bypass the Supabase JS client here — blob serialization via the
      //    client is unreliable in React Native; a plain fetch PUT works reliably.
      const fileResponse = await fetch(uri);
      const blob = await fileResponse.blob();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });

      if (!uploadResponse.ok) {
        const text = await uploadResponse.text().catch(() => String(uploadResponse.status));
        throw new Error(`Storage upload failed: ${text}`);
      }

      // 3. Confirm path in our DB
      await confirmMemoryUpload(id, path);

      setPhotos(prev => [...prev, { localUri: uri, path }]);
    } catch (e: any) {
      console.error('[memory] upload failed:', e);
      Alert.alert('Upload failed', e.message ?? 'Could not upload photo. Try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto(idx: number) {
    if (!id) return;
    const photo = photos[idx];
    if (!photo) return;
    try {
      await deleteMemoryPhoto(id, photo.path);
    } catch (e) {
      console.error('[memory] delete photo failed:', e);
    }
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!id || !motive) return;
    setSaving(true);
    try {
      await saveMemoryMeta(id, {
        vibeTags: selectedTags,
        rating: rating || undefined,
        venueRating: venueRating || undefined,
      });
      router.replace(`/(app)/(tabs)/motives/${id}/memories` as any);
    } catch (e) {
      console.error('Save memory failed:', e);
      setSaving(false);
    }
  }

  const title = motive?.title ?? 'Memory';
  const truncTitle = title.length > 20 ? title.slice(0, 20) + '…' : title;

  function handleBack() {
    if (step === 1) router.back();
    else setStep(s => s - 1);
  }

  const canNext3 = rating > 0;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>

      {/* Top bar */}
      <View style={styles.topBar}>
        <BackButton variant="light" onPress={handleBack} />
        <Text style={styles.topBarStep}>{step} / 4</Text>
      </View>

      {/* Steps */}
      <Animated.View style={{ flex: 1 }} key={step} entering={FadeInRight.duration(220).springify()}>
        {step === 1 && (
          <Step1Vibe
            category={motive?.category ?? ''}
            selected={selectedTags}
            onToggle={toggleTag}
          />
        )}
        {step === 2 && (
          <Step2Photos
            photos={photos}
            uploading={uploading}
            onAdd={handleAddPhoto}
            onRemove={handleRemovePhoto}
          />
        )}
        {step === 3 && (
          <Step3Rating
            rating={rating}
            setRating={setRating}
            venueRating={venueRating}
            setVenueRating={setVenueRating}
            placeName={motive?.placeName ?? null}
          />
        )}
        {step === 4 && motive && (
          <Step4Card
            motive={motive}
            photos={photos}
            selectedTags={selectedTags}
            onSave={handleSave}
            saving={saving}
          />
        )}
      </Animated.View>

      {/* CTA footer (steps 1-3) */}
      {step < 4 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {step === 2 && (
            <TouchableOpacity onPress={() => setStep(s => s + 1)} style={styles.skipLink}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
          <OrangeCta
            label="Next"
            onPress={() => setStep(s => s + 1)}
            disabled={(step === 3 && !canNext3) || uploading}
          />
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.background,
  },
  progressTrack: {
    height: 3,
    backgroundColor: C.border,
    width: '100%',
  },
  progressFill: {
    height: 3,
    backgroundColor: C.primary,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  topBarStep: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.textTertiary,
  },
  stepScroll: {
    flex: 1,
  },
  stepContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
  },
  stepHeading: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    color: C.text,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  stepSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textTertiary,
    marginBottom: 20,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  counterText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.textTertiary,
  },
  counterTextMet: {
    color: C.primary,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
  },
  counterCheck: {
    color: C.primary,
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  tagPillSelected: {
    backgroundColor: '#FFF0EB',
    borderColor: C.primary,
    borderWidth: 1.5,
  },
  tagEmoji: {
    fontSize: 14,
  },
  tagLabel: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: '#444',
  },
  tagLabelSelected: {
    color: C.primary,
    fontFamily: Fonts.bodySemiBold,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoSlotFilled: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xLine1: {
    position: 'absolute',
    width: 10,
    height: 1.5,
    backgroundColor: C.textInverse,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  xLine2: {
    position: 'absolute',
    width: 10,
    height: 1.5,
    backgroundColor: C.textInverse,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
  photoSlotEmpty: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D0CAC4',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSlotLocked: {
    borderColor: C.border,
    borderStyle: 'solid',
    opacity: 0.4,
  },
  plusH: {
    position: 'absolute',
    width: 20,
    height: 2,
    backgroundColor: '#C0B8B0',
    borderRadius: 1,
  },
  plusV: {
    position: 'absolute',
    width: 2,
    height: 20,
    backgroundColor: '#C0B8B0',
    borderRadius: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    marginTop: 20,
    marginBottom: 32,
  },
  ratingItem: {
    alignItems: 'center',
    minWidth: 44,
  },
  ratingEmoji: {
    textAlign: 'center',
  },
  ratingLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.primary,
    marginTop: 6,
  },
  venueCard: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  venueEyebrow: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.primary,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  venueName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: C.text,
    marginBottom: 10,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  star: {
    fontSize: 22,
    color: '#D0CAC4',
  },
  starFilled: {
    color: C.primary,
  },
  cardEyebrow: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textTertiary,
    letterSpacing: 2,
    marginBottom: 16,
    textAlign: 'center',
  },
  memCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: 'hidden',
    width: SCREEN_WIDTH - 48,
    marginBottom: 20,
    ...Shadow.md,
  },
  memCardBand: {
    height: 3,
    width: '100%',
  },
  memCardBody: {
    padding: 16,
  },
  memCardMeta: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.primary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  memCardTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    color: C.text,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  memAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  memOverflow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  memOverflowText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textSecondary,
  },
  memPhotos: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  memPhotoSlot: {
    flex: 1,
    height: 60,
    borderRadius: 6,
  },
  memTags: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    marginBottom: 12,
  },
  memWatermark: {
    fontFamily: Fonts.headingRegular,
    fontSize: 14,
    color: C.text,
    opacity: 0.18,
    textAlign: 'right',
    fontStyle: 'italic',
  },
  galleryLink: {
    marginTop: 8,
    paddingVertical: 8,
  },
  galleryLinkText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.primary,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: C.background,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  skipLink: {
    alignItems: 'center',
    marginBottom: 10,
  },
  skipText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textTertiary,
  },
  ctaBtn: {
    width: '100%',
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaBtnDisabled: {
    backgroundColor: C.border,
  },
  ctaText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.textInverse,
  },
});
