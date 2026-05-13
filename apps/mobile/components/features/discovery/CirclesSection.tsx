import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors, Fonts } from '../../../constants/theme';
import { CircleSuggestion, joinCircle } from '../../../lib/api';
import { CircleIcon } from '../../ui/CircleIcon';
import { SkeletonCircleRow } from '../../ui/Skeleton';

const C = Colors.light;

const TOP_N = 3; // always show exactly 3 on discovery, then navigate for more

type Props = {
  circles: CircleSuggestion[];
  loading: boolean;
};

export function CirclesSection({ circles, loading }: Props) {
  const [joinedCircle, setJoinedCircle] = useState<CircleSuggestion | null>(null);
  const [joinResult, setJoinResult] = useState<{ status: 'active' | 'pending'; memberCount: number } | null>(null);
  const [joiningIds, setJoiningIds] = useState<Set<string>>(new Set());
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  async function handleJoin(circle: CircleSuggestion) {
    if (joiningIds.has(circle.id) || doneIds.has(circle.id)) return;
    setJoiningIds((prev) => new Set([...prev, circle.id]));
    try {
      const result = await joinCircle(circle.id);
      setJoiningIds((prev) => { const next = new Set(prev); next.delete(circle.id); return next; });
      setDoneIds((prev) => new Set([...prev, circle.id]));
      if (result.status === 'active') {
        setJoinedCircle(circle);
        setJoinResult({ status: result.status, memberCount: result.memberCount });
      }
    } catch (e) {
      console.error('Join failed:', e);
      setJoiningIds((prev) => { const next = new Set(prev); next.delete(circle.id); return next; });
    }
  }

  if (loading) {
    return (
      <View style={styles.section}>
        <View style={styles.header}>
          <Text style={styles.title}>Circles to join</Text>
        </View>
        {[0, 1, 2].map((i) => <SkeletonCircleRow key={i} />)}
      </View>
    );
  }

  const visibleCircles = circles.filter((c) => !doneIds.has(c.id));

  if (visibleCircles.length === 0) return null;

  const topThree = visibleCircles.slice(0, TOP_N);
  const remaining = visibleCircles.length - TOP_N;

  return (
    <>
      <View style={styles.section}>
        <View style={styles.header}>
          <Text style={styles.title}>Circles to join</Text>
          {circles.length > TOP_N && (
            <TouchableOpacity onPress={() => router.push('/(app)/discover-circles' as any)}>
              <Text style={styles.seeMore}>See all {circles.length} →</Text>
            </TouchableOpacity>
          )}
        </View>

        {topThree.map((circle) => {
          const isJoining = joiningIds.has(circle.id);
          return (
            <View key={circle.id} style={styles.row}>
              <CircleIcon
                coverImage={circle.coverImage}
                categoryEmoji={circle.categoryEmoji}
                categoryColor={circle.categoryColor}
                size={44}
                borderRadius={14}
              />
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{circle.name}</Text>
                <Text style={styles.meta}>
                  {circle.memberCount} members
                  {circle.friendsInsideCount > 0
                    ? ` · ${circle.friendsInsideCount} friend${circle.friendsInsideCount > 1 ? 's' : ''} inside`
                    : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.joinBtn, isJoining && styles.joinBtnPending]}
                onPress={() => handleJoin(circle)}
                disabled={isJoining}
              >
                <Text style={[styles.joinText, isJoining && { color: C.primary }]}>
                  {isJoining ? '…' : (circle.requiresApproval ? 'Request' : 'Join')}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* "See more circles" row when there are more than 3 */}
        {remaining > 0 && (
          <TouchableOpacity
            style={styles.seeMoreRow}
            onPress={() => router.push('/(app)/discover-circles' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.seeMoreIconWrap}>
              <View style={styles.seeMorePlus} />
              <View style={styles.seeMorePlusH} />
            </View>
            <Text style={styles.seeMoreRowText}>
              +{remaining} more circle{remaining > 1 ? 's' : ''} to explore
            </Text>
            <View style={styles.seeMoreChevron} />
          </TouchableOpacity>
        )}
      </View>

      {/* Join confirmation modal */}
      {joinedCircle && joinResult && (
        <Modal visible animationType="fade" transparent statusBarTranslucent>
          <View style={styles.overlay}>
            <View style={styles.confirmContent}>
              <CircleIcon
                coverImage={joinedCircle.coverImage}
                categoryEmoji={joinedCircle.categoryEmoji}
                categoryColor={joinedCircle.categoryColor}
                size={80}
                borderRadius={24}
                style={{ marginBottom: 18 }}
              />
              <Text style={styles.confirmBadge}>YOU'RE IN ✦</Text>
              <Text style={styles.confirmName}>{joinedCircle.name}</Text>
              <Text style={styles.confirmCount}>{joinResult.memberCount} members now in your circle</Text>
              <View style={styles.confirmList}>
                {[
                  { text: 'Added to the group chat' },
                  { text: 'Members appear in Discovery as potential connections' },
                  { text: "Prompts sometimes tailored to the group's interests" },
                ].map((item, i) => (
                  <View key={i} style={styles.confirmItem}>
                    <View style={styles.confirmDot} />
                    <Text style={styles.confirmItemText}>{item.text}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={styles.confirmCta}
                onPress={() => { setJoinedCircle(null); setJoinResult(null); }}
              >
                <Text style={styles.confirmCtaText}>Back to Discovery</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 16, marginTop: 14 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontFamily: Fonts.headingRegular,
    fontSize: 17,
    color: C.text,
    fontStyle: 'italic',
    letterSpacing: -0.2,
  },
  seeMore: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.primary,
    opacity: 0.85,
  },

  // Circle row
  row: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderWarm,
    borderRadius: 16,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 8,
    shadowColor: C.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  icon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconText: { fontSize: 20 },
  info: { flex: 1 },
  name: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13, color: C.text, letterSpacing: -0.1,
  },
  meta: {
    fontFamily: Fonts.body,
    fontSize: 11, color: C.textTertiary, marginTop: 2,
  },
  joinBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexShrink: 0,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  joinBtnPending: {
    backgroundColor: 'rgba(255,107,53,0.12)',
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
  },
  joinText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12, color: '#fff',
  },

  // See more row
  seeMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surfaceAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  seeMoreIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  seeMorePlus: {
    width: 12, height: 2,
    backgroundColor: C.primary,
    borderRadius: 1,
    position: 'absolute',
  },
  seeMorePlusH: {
    width: 2, height: 12,
    backgroundColor: C.primary,
    borderRadius: 1,
    position: 'absolute',
  },
  seeMoreRowText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13, color: C.text, flex: 1,
  },
  seeMoreChevron: {
    width: 7, height: 7,
    borderRightWidth: 2, borderTopWidth: 2,
    borderColor: C.textTertiary,
    transform: [{ rotate: '45deg' }],
  },

  // Confirmation modal
  overlay: {
    flex: 1, backgroundColor: '#100D0B',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  confirmContent: { alignItems: 'center', width: '100%' },
  confirmIcon: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  confirmIconText: { fontSize: 38 },
  confirmBadge: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11, color: C.primary,
    letterSpacing: 1, marginBottom: 10, opacity: 0.9,
  },
  confirmName: {
    fontFamily: Fonts.heading,
    fontSize: 24, color: '#F2E8DC',
    fontStyle: 'italic',
    marginBottom: 6, textAlign: 'center', letterSpacing: -0.4,
  },
  confirmCount: {
    fontFamily: Fonts.body,
    fontSize: 13, color: 'rgba(242,232,220,0.38)',
    marginBottom: 24,
  },
  confirmList: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 16, width: '100%', gap: 10, marginBottom: 20,
  },
  confirmItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  confirmDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: C.primary, marginTop: 4, flexShrink: 0, opacity: 0.7,
  },
  confirmItemText: {
    fontFamily: Fonts.body,
    fontSize: 12, color: 'rgba(242,232,220,0.65)', flex: 1, lineHeight: 18,
  },
  confirmCta: {
    backgroundColor: C.primary,
    borderRadius: 14, padding: 16,
    width: '100%', alignItems: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  confirmCtaText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15, color: '#fff',
  },
});
