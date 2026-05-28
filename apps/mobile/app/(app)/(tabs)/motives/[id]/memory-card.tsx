import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Fonts, Shadow } from '../../../../../constants/theme';
import { CATEGORY_MAP } from '../../../../../constants/motives';
import { Avatar } from '../../../../../components/ui/Avatar';
import { getMotive, getMemory, Motive, MotiveMemory } from '../../../../../lib/api';
import { BackButton } from '../../../../../components/ui/BackButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PHOTO_COLORS = ['#3A6EA8', '#7B5EA7', '#2EC4B6', '#C84B7A', '#E08040', '#4CAF81'];

// ─── Memory card component ────────────────────────────────────────────────────

function MemoryCardView({ motive, memory }: { motive: Motive; memory: MotiveMemory | null }) {
  const now = new Date();
  const monthYear = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const cat = CATEGORY_MAP[motive.category as keyof typeof CATEGORY_MAP];
  const catLabel = cat?.label ?? motive.category;
  const bandColor = cat?.color ?? C.primary;
  const tagLine = (memory?.vibeTags ?? []).slice(0, 3).join(' · ');
  const visibleAtt = (motive.attendees ?? []).slice(0, 4);
  const overflow = (motive.attendees ?? []).length - 4;
  const photoUrls = memory?.photoUrls ?? [];

  return (
    <View style={styles.card}>
      <View style={[styles.cardBand, { backgroundColor: bandColor }]} />
      <View style={styles.cardBody}>
        <Text style={styles.cardMeta}>{catLabel.toUpperCase()} · {monthYear.toUpperCase()}</Text>
        <Text style={styles.cardTitle}>{motive.title}</Text>

        {/* Attendee avatars */}
        <View style={styles.avatarRow}>
          {visibleAtt.map((a, i) => (
            <View key={a.userId} style={{ marginLeft: i > 0 ? -6 : 0 }}>
              <Avatar name={a.name} userId={a.userId} size="xs" />
            </View>
          ))}
          {overflow > 0 && (
            <View style={styles.overflowCircle}>
              <Text style={styles.overflowText}>+{overflow}</Text>
            </View>
          )}
        </View>

        {/* Photo slots */}
        <View style={styles.photoRow}>
          {[0, 1, 2].map(i => (
            <View
              key={i}
              style={[
                styles.photoSlot,
                { backgroundColor: photoUrls[i] ? '#3A6EA8' : PHOTO_COLORS[i] },
              ]}
            />
          ))}
        </View>

        {/* Vibe tags */}
        {tagLine.length > 0 && (
          <Text style={styles.tagLine}>{tagLine}</Text>
        )}

        {/* Watermark */}
        <Text style={styles.watermark}>Berg</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MemoryCardScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [motive, setMotive] = useState<Motive | null>(null);
  const [memory, setMemory] = useState<MotiveMemory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.allSettled([getMotive(id), getMemory(id)])
      .then(([mRes, memRes]) => {
        if (mRes.status === 'fulfilled') setMotive(mRes.value.motive);
        if (memRes.status === 'fulfilled') setMemory(memRes.value.memory);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleShare() {
    try {
      await Share.share({
        message: motive ? `Check out this memory from "${motive.title}" on Berg!` : 'Check out this memory on Berg!',
      });
    } catch (e) {
      console.error('Share failed:', e);
    }
  }

  if (loading) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }, styles.centered]}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  if (!motive) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }, styles.centered]}>
        <Text style={styles.errorText}>Memory not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <BackButton variant="dark" />
        <Text style={styles.headerLabel}>Memory Card</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Card centered */}
      <View style={styles.cardContainer}>
        <Text style={styles.eyebrow}>MEMORY CARD</Text>
        <MemoryCardView motive={motive} memory={memory} />
      </View>

      {/* Action buttons */}
      <View style={[styles.actionRow, { paddingBottom: insets.bottom + 20 }]}>
        {/* Save/download button — simple down-arrow icon */}
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
          <View style={styles.arrowDown}>
            <View style={styles.arrowShaft} />
            <View style={styles.arrowHead} />
          </View>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity activeOpacity={0.85} onPress={handleShare} style={[styles.shareWrap, styles.shareBtn]}>
          <Text style={styles.shareBtnText}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.textTertiary,
  },
  backLinkText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: C.primary,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.textTertiary,
  },

  // Card area
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textTertiary,
    letterSpacing: 2,
    marginBottom: 16,
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: 'hidden',
    width: SCREEN_WIDTH - 48,
    ...Shadow.lg,
  },
  cardBand: {
    height: 3,
    width: '100%',
  },
  cardBody: {
    padding: 16,
  },
  cardMeta: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.primary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  cardTitle: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    color: C.text,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  overflowCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  overflowText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textSecondary,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  photoSlot: {
    flex: 1,
    height: 70,
    borderRadius: 6,
  },
  tagLine: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    marginBottom: 14,
  },
  watermark: {
    fontFamily: Fonts.headingRegular,
    fontSize: 14,
    color: C.text,
    opacity: 0.18,
    textAlign: 'right',
    fontStyle: 'italic',
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  iconBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  arrowDown: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
  },
  arrowShaft: {
    width: 2,
    height: 12,
    backgroundColor: C.textSecondary,
    borderRadius: 1,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: C.textSecondary,
    marginTop: 1,
  },
  shareWrap: {
    flex: 1,
    borderRadius: 14,
  },
  shareBtn: {
    backgroundColor: C.primary,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
  },
  shareBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.textInverse,
  },
});
