import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Pressable,
  TextInput,
  RefreshControl,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Fonts } from '../../../../constants/theme';
import { authClient } from '../../../../lib/auth';
import { apiFetch } from '../../../../lib/api';
import { CATEGORY_MAP, avatarColor, initials } from '../../../../constants/motives';
import { Avatar } from '../../../../components/ui/Avatar';
import { SkeletonMotiveCard } from '../../../../components/ui/Skeleton';

const C = Colors.light;

// ─── Category helper ──────────────────────────────────────────────────────────
function getCat(key: string) {
  return CATEGORY_MAP[key as keyof typeof CATEGORY_MAP] ?? { label: key, color: C.textTertiary, emoji: '•', tint: 'rgba(150,150,150,0.08)' };
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MotiveStatus = 'planning' | 'confirmed' | 'past' | 'open' | 'locked' | 'completed' | 'cancelled' | 'unconfirmed';
type Attendee = { userId: string; name: string | null; rsvpStatus: string };
type Motive = {
  id: string;
  title: string;
  category: string;
  status: MotiveStatus;
  scheduledAt: string | null;
  venueName: string | null;
  attendees: Attendee[];
  memoryCount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string | null): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = days[d.getDay()];
  const date = d.getDate();
  const month = months[d.getMonth()];
  const hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const h = hours % 12 || 12;
  return `${day} ${date} ${month} · ${h}:${mins} ${ampm}`;
}

function formatHeaderDate(): string {
  const d = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

/** True if the motive's scheduled time has already passed */
function isScheduledInPast(scheduledAt: string | null): boolean {
  if (!scheduledAt) return false;
  return new Date(scheduledAt) < new Date();
}

/**
 * Compute the effective status for display — if scheduledAt has passed and
 * the DB status is still planning/confirmed, we show it as Past immediately
 * without waiting for the nightly job. This is client-side only; the DB gets
 * updated by the background job or when the user confirms.
 */
function effectiveStatus(motive: Motive): MotiveStatus {
  const dbStatus = motive.status as string;
  if ((dbStatus === 'planning' || dbStatus === 'confirmed') && isScheduledInPast(motive.scheduledAt)) {
    return 'past' as MotiveStatus;
  }
  return dbStatus as MotiveStatus;
}

type StatusConfig = { label: string; color: string; bg: string };
function getStatusConfig(status: MotiveStatus): StatusConfig {
  const s = status as string;
  switch (s) {
    case 'past':        return { label: 'Past',      color: C.textTertiary,    bg: 'rgba(150,150,150,0.1)' };
    case 'planning':    return { label: 'Planning',  color: '#D4571E', bg: 'rgba(255,107,53,0.1)' };
    case 'confirmed':  return { label: 'Confirmed', color: '#1E6644', bg: 'rgba(45,106,79,0.1)' };
    case 'open':       return { label: 'Active',    color: '#1E6644', bg: 'rgba(45,106,79,0.1)' };
    case 'unconfirmed':return { label: 'Planning',  color: '#D4571E', bg: 'rgba(255,107,53,0.1)' };
    case 'completed':  return { label: 'Done',      color: C.textTertiary,    bg: 'rgba(150,150,150,0.1)' };
    case 'cancelled':  return { label: 'Cancelled', color: '#C0323E', bg: 'rgba(230,57,70,0.08)' };
    case 'locked':     return { label: 'Draft',     color: '#5A7FBF', bg: 'rgba(100,136,200,0.1)' };
    default:           return { label: s,           color: C.textTertiary,    bg: 'rgba(150,150,150,0.1)' };
  }
}

type FilterKey = 'all' | 'active' | 'past';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'past', label: 'Past' },
];

function filterMotives(motives: Motive[], filter: FilterKey): Motive[] {
  if (filter === 'active') return motives.filter(m => {
    const eff = effectiveStatus(m) as string;
    return eff === 'planning' || eff === 'confirmed' || eff === 'open' || eff === 'unconfirmed' || eff === 'locked';
  });
  if (filter === 'past') return motives.filter(m => {
    const eff = effectiveStatus(m) as string;
    return eff === 'past' || eff === 'completed' || eff === 'cancelled';
  });
  return motives;
}

// ─── Avatar stack ─────────────────────────────────────────────────────────────
function AvatarStack({ attendees }: { attendees: Attendee[] }) {
  const visible = attendees.slice(0, 4);
  const overflow = attendees.length - visible.length;
  const names = visible.slice(0, 2).map(a => a.name?.split(' ')[0] ?? 'Someone');
  const nameText = overflow > 0
    ? names.join(', ') + ` +${overflow}`
    : names.join(', ');

  return (
    <View style={styles.attendeeRow}>
      <View style={styles.avatarStack}>
        {visible.map((a, i) => (
          <Avatar
            key={a.userId}
            name={a.name ?? undefined}
            userId={a.userId}
            size="xs"
            style={[styles.avatarCircle, { marginLeft: i === 0 ? 0 : -8, zIndex: visible.length - i }]}
          />
        ))}
        {overflow > 0 && (
          <View style={[styles.avatarCircle, styles.avatarOverflow, { marginLeft: -8 }]}>
            <Text style={styles.avatarOverflowText}>+{overflow}</Text>
          </View>
        )}
      </View>
      {names.length > 0 && (
        <Text style={styles.attendeeNames} numberOfLines={1}>{nameText}</Text>
      )}
    </View>
  );
}

// ─── Motive card ──────────────────────────────────────────────────────────────
function MotiveCard({ motive, index }: { motive: Motive; index: number }) {
  const scale = useSharedValue(1);
  const cat = getCat(motive.category);
  const eff = effectiveStatus(motive) as string;
  const isDone = eff === 'past' || eff === 'completed' || eff === 'cancelled';
  const hasMemories = isDone && motive.memoryCount > 0;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={() => router.push(`/(app)/(tabs)/motives/${motive.id}` as any)}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.card}
        >
          {/* Left accent bar */}
          <View style={[styles.cardAccent, { backgroundColor: cat.color }]} />

          {/* Card content */}
          <View style={styles.cardContent}>
            {/* Top row: category + status */}
            <View style={styles.cardTopRow}>
              <View style={styles.categoryRow}>
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text style={[styles.categoryLabel, { color: cat.color }]}>{cat.label}</Text>
              </View>
              {(() => {
                const s = getStatusConfig(effectiveStatus(motive));
                return (
                  <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusPillText, { color: s.color }]}>{s.label}</Text>
                  </View>
                );
              })()}
            </View>

            {/* Title */}
            <Text style={styles.cardTitle} numberOfLines={2}>{motive.title}</Text>

            {/* Date */}
            <Text style={styles.cardMeta}>{formatDate(motive.scheduledAt)}</Text>

            {/* Attendees */}
            {motive.attendees.length > 0 && (
              <AvatarStack attendees={motive.attendees} />
            )}

            {/* Memories strip — completed motives only */}
            {hasMemories && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  router.push(`/(app)/(tabs)/motives/${motive.id}/memories` as any);
                }}
                style={styles.memoriesStrip}
              >
                <Text style={styles.memoriesStripText}>
                  {motive.memoryCount} memor{motive.memoryCount === 1 ? 'y' : 'ies'}
                </Text>
                <Text style={styles.memoriesStripArrow}>›</Text>
              </Pressable>
            )}

            {/* Prompt to add memories when none yet */}
            {isDone && !hasMemories && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  router.push(`/(app)/(tabs)/motives/${motive.id}/memory` as any);
                }}
                style={styles.memoriesStrip}
              >
                <Text style={[styles.memoriesStripText, { color: C.textTertiary }]}>Add memories</Text>
                <Text style={styles.memoriesStripArrow}>›</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 900 }),
        withTiming(1, { duration: 900 }),
      ),
      -1,
      false,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 2 - pulse.value,
  }));

  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>Nothing planned yet</Text>
      <Text style={styles.emptySubtitle}>Tap + to start your first motive</Text>
      <View style={styles.fabHintWrapper}>
        <Animated.View style={[styles.fabHintPulse, pulseStyle]} />
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MotivesScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const [motives, setMotives] = useState<Motive[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMotives = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await apiFetch<{ motives: Motive[] }>('/api/motives');
      setMotives(data.motives);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMotives();
  }, [fetchMotives]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchMotives();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    const byFilter = filterMotives(motives, filter);
    if (!searchQuery.trim()) return byFilter;
    const q = searchQuery.toLowerCase();
    return byFilter.filter(m => m.title.toLowerCase().includes(q));
  }, [motives, filter, searchQuery]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Motives</Text>
        <Text style={styles.headerDate}>{formatHeaderDate()}</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={18} color={C.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search motives…"
          placeholderTextColor={C.textTertiary}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={16} color={C.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, paddingTop: 4 }}>
          {[0, 1, 2].map(i => <SkeletonMotiveCard key={i} />)}
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Something went wrong</Text>
          <TouchableOpacity onPress={fetchMotives} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={m => m.id}
          renderItem={({ item, index }) => <MotiveCard motive={item} index={index} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
          }
        />
      )}

      {/* FAB */}
      <Animated.View
        entering={FadeInUp.delay(300).springify()}
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
      >
        <TouchableOpacity
          onPress={() => router.push('/(app)/(tabs)/motives/create' as any)}
          style={styles.fabBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 28,
    fontStyle: 'italic',
    color: C.text,
    letterSpacing: -0.3,
  },
  headerDate: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: C.textTertiary,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.text,
    padding: 0,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: C.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: {
    backgroundColor: C.text,
    borderColor: C.text,
  },
  chipText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.textSecondary,
  },
  chipTextActive: {
    color: C.textInverse,
  },
  list: {
    paddingTop: 4,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.borderWarm,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#8B6A4A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    flexDirection: 'row',
  },
  cardAccent: {
    width: 3,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  cardContent: {
    flex: 1,
    paddingLeft: 18,
    paddingRight: 14,
    paddingVertical: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  categoryLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
  },
  statusPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  cardTitle: {
    fontFamily: Fonts.headingRegular,
    fontStyle: 'italic',
    fontSize: 17,
    color: C.text,
    marginTop: 6,
    lineHeight: 22,
  },
  cardMeta: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    marginTop: 4,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.surface,
  },
  avatarOverflow: {
    backgroundColor: C.border,
  },
  avatarOverflowText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    color: C.textSecondary,
  },
  attendeeNames: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: C.textTertiary,
    flex: 1,
  },
  memoriesStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,107,53,0.12)',
    gap: 6,
  },
  memoriesStripText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 12,
    color: C.primary,
    flex: 1,
  },
  memoriesStripArrow: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    color: C.primary,
    lineHeight: 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: C.textSecondary,
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
  },
  retryText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    color: C.text,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontFamily: 'Fraunces_400Regular',
    fontStyle: 'italic',
    fontSize: 26,
    color: C.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptySubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: C.textTertiary,
    textAlign: 'center',
  },
  fabHintWrapper: {
    marginTop: 40,
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
  },
  fabHintPulse: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,107,53,0.15)',
  },
  fab: {
    position: 'absolute',
    right: 20,
  },
  fabBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: {
    color: C.textInverse,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
    marginTop: -2,
  },
});
