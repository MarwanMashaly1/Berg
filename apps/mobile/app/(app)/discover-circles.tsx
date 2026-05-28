import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, RefreshControl, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Fonts } from '../../constants/theme';
import { Skeleton } from '../../components/ui/Skeleton';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { joinCircle, getDiscoveryCircles, CircleSuggestion } from '../../lib/api';
import { QK } from '../../lib/hooks/queries';
import { CircleIcon } from '../../components/ui/CircleIcon';
import { log } from '../../lib/logger';

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
    } catch (err) {
      log.error('circle join failed', err);
      Alert.alert('Something went wrong', 'Please try again.');
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
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  const { data, isLoading: loading, isRefetching, refetch } = useQuery({
    queryKey: QK.discCircles(),
    queryFn: () => getDiscoveryCircles(),
    staleTime: 5 * 60 * 1000,
  });
  const circles = data?.circles ?? [];

  function handleJoined(id: string) {
    setJoinedIds((prev) => new Set([...prev, id]));
  }

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Circles to join" />

      <FlatList
        data={loading ? Array.from({ length: 6 }) : circles.filter((c) => !joinedIds.has(c.id))}
        keyExtractor={(item, i) => (item as CircleSuggestion)?.id ?? String(i)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={C.primary} />
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
