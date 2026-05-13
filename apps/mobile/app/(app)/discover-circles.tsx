import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../constants/theme';
import { Skeleton } from '../../components/ui/Skeleton';
import { BackButton } from '../../components/ui/BackButton';
import { getDiscoveryCircles, joinCircle, CircleSuggestion } from '../../lib/api';
import { CircleIcon } from '../../components/ui/CircleIcon';

const C = Colors.light;

function CircleRow({ circle, onJoined }: { circle: CircleSuggestion; onJoined: (id: string) => void }) {
  const [state, setState] = useState<'idle' | 'joining' | 'pending'>('idle');
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleJoin() {
    if (state !== 'idle') return;
    setState('joining');
    try {
      const result = await joinCircle(circle.id);
      if (result.status === 'active') {
        setShowConfirm(true);
      } else {
        setState('pending');
      }
    } catch {
      setState('idle');
    }
  }

  const btnLabel =
    state === 'joining' ? '…'
    : state === 'pending' ? 'Pending ✓'
    : circle.requiresApproval ? 'Request' : 'Join';

  return (
    <>
      <View style={styles.row}>
        <CircleIcon
          coverImage={circle.coverImage}
          categoryEmoji={circle.categoryEmoji}
          categoryColor={circle.categoryColor}
          size={44}
          borderRadius={14}
        />
        <View style={styles.info}>
          <Text style={styles.circleName} numberOfLines={1}>{circle.name}</Text>
          {circle.description ? (
            <Text style={styles.circleDesc} numberOfLines={2}>{circle.description}</Text>
          ) : null}
          <Text style={styles.circleMeta}>
            {circle.memberCount} members
            {circle.friendsInsideCount > 0
              ? ` · ${circle.friendsInsideCount} friend${circle.friendsInsideCount > 1 ? 's' : ''} inside`
              : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.joinBtn,
            state === 'pending' && styles.joinBtnDone,
            state === 'joining' && { opacity: 0.55 },
          ]}
          onPress={handleJoin}
          disabled={state !== 'idle'}
        >
          <Text style={[styles.joinText, state === 'pending' && styles.joinTextDone]}>
            {btnLabel}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Join confirmation modal */}
      {showConfirm && (
        <Modal visible animationType="fade" transparent statusBarTranslucent>
          <View style={styles.overlay}>
            <CircleIcon
              coverImage={circle.coverImage}
              categoryEmoji={circle.categoryEmoji}
              categoryColor={circle.categoryColor}
              size={80}
              borderRadius={24}
              style={{ marginBottom: 18 }}
            />
            <Text style={styles.confirmBadge}>YOU'RE IN ✦</Text>
            <Text style={styles.confirmName}>{circle.name}</Text>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={() => { setShowConfirm(false); onJoined(circle.id); }}
            >
              <Text style={styles.confirmBtnText}>Back to circles</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </>
  );
}

function SkeletonRow() {
  return (
    <View style={[styles.row, { gap: 12 }]}>
      <Skeleton width={44} height={44} borderRadius={13} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width={130} height={12} borderRadius={6} />
        <Skeleton width={90} height={10} borderRadius={5} />
      </View>
      <Skeleton width={54} height={34} borderRadius={10} />
    </View>
  );
}

export default function DiscoverCirclesScreen() {
  const insets = useSafeAreaInsets();
  const [circles, setCircles]     = useState<CircleSuggestion[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  function handleJoined(id: string) {
    setJoinedIds((prev) => new Set([...prev, id]));
  }

  const load = useCallback(async () => {
    try {
      const { circles: c } = await getDiscoveryCircles();
      setCircles(c);
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton variant="light" />
        <Text style={styles.title}>Circles to join</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={loading ? Array.from({ length: 6 }) : circles.filter((c) => !joinedIds.has(c.id))}
        keyExtractor={(item, i) => (item as CircleSuggestion)?.id ?? String(i)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        renderItem={({ item }) =>
          loading
            ? <SkeletonRow />
            : <CircleRow circle={item as CircleSuggestion} onJoined={handleJoined} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No suggestions yet</Text>
              <Text style={styles.emptySub}>
                Connect with more people to get circle recommendations.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 17,
    color: C.text,
    fontStyle: 'italic',
    letterSpacing: -0.3,
  },

  // Circle row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.borderWarm,
    backgroundColor: C.surface,
  },
  icon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconText: { fontSize: 20 },
  info: { flex: 1 },
  circleName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14, color: C.text, letterSpacing: -0.1,
  },
  circleDesc: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary, marginTop: 1, lineHeight: 15 },
  circleMeta: {
    fontFamily: Fonts.body,
    fontSize: 11, color: C.textTertiary, marginTop: 2,
  },
  joinBtn: {
    backgroundColor: C.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexShrink: 0,
  },
  joinBtnDone: {
    backgroundColor: 'rgba(45,106,79,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(45,106,79,0.25)',
  },
  joinText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12, color: C.textInverse,
  },
  joinTextDone: { color: '#2D6A4F' },

  // Confirmation modal
  overlay: {
    flex: 1, backgroundColor: '#100D0B',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  confirmIcon: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  confirmEmoji: { fontSize: 38 },
  confirmBadge: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11, color: C.primary,
    letterSpacing: 1, marginBottom: 10,
  },
  confirmName: {
    fontFamily: Fonts.heading,
    fontSize: 24, color: '#F2E8DC',
    fontStyle: 'italic', textAlign: 'center', marginBottom: 28,
  },
  confirmBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 14,
    width: '100%', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  confirmBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13, color: 'rgba(242,232,220,0.5)',
  },

  // Empty
  empty: {
    paddingTop: 60, alignItems: 'center', paddingHorizontal: 40,
  },
  emptyTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16, color: C.text, marginBottom: 8,
  },
  emptySub: {
    fontFamily: Fonts.body,
    fontSize: 13, color: C.textSecondary,
    textAlign: 'center', lineHeight: 19,
  },
});
