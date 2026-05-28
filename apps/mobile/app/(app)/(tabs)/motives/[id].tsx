import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { C, Fonts } from '../../../../constants/theme';
import { Routes } from '../../../../lib/routes';
import { CATEGORY_MAP } from '../../../../constants/motives';
import { BackButton } from '../../../../components/ui/BackButton';
import { useCurrentUser } from '../../../../hooks/use-current-user';
import { apiFetch, confirmMotive, getMyMemory, type MyMemory } from '../../../../lib/api';
import { log } from '../../../../lib/logger';
import { RsvpButtons } from '../../../../components/motives/RsvpButtons';
import { ConfirmationBanner } from '../../../../components/motives/ConfirmationBanner';
import { AttendeeSection, type Attendee } from '../../../../components/motives/AttendeeSection';

// ─── Types ────────────────────────────────────────────────────────────────────
// Backend sends: 'invited' | 'going' | 'maybe' | 'declined'
type RsvpStatus = 'invited' | 'going' | 'maybe' | 'declined';
type ActivityItem = {
  id: string;
  type: 'joined' | 'passed' | 'invited' | 'created' | 'updated';
  actorName: string | null;
  createdAt: string;
};
type MotiveStatus = 'planning' | 'confirmed' | 'past' | 'open' | 'locked' | 'completed' | 'cancelled' | 'unconfirmed';
type MotiveDetail = {
  id: string;
  title: string;
  category: string;
  status: MotiveStatus;
  scheduledAt: string | null;
  venueName: string | null;
  placeAddress: string | null;
  note: string | null;
  attendees: Attendee[];
  activity: ActivityItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatFullDate(iso: string | null): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = d.getHours() >= 12 ? 'pm' : 'am';
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} · ${h}:${m} ${ap}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function activityDot(type: ActivityItem['type']): string {
  switch (type) {
    case 'joined': return '#4CAF81';
    case 'passed': return C.error;
    case 'invited': return C.primary;
    case 'created': return '#6488C8';
    default: return C.textTertiary;
  }
}

function activityText(item: ActivityItem): string {
  const name = item.actorName ?? 'Someone';
  switch (item.type) {
    case 'joined': return `${name} is going`;
    case 'passed': return `${name} can't make it`;
    case 'invited': return `${name} was invited`;
    case 'created': return `${name} created this motive`;
    case 'updated': return `${name} updated the details`;
    default: return `${name} did something`;
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MotiveDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useCurrentUser();
  const [myRsvp, setMyRsvp] = useState<RsvpStatus | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { data: motive, isLoading: loading, isError, refetch } = useQuery({
    queryKey: ['motives', id],
    queryFn: async () => {
      const data = await apiFetch<{
        motive: any;
        attendees: Array<{ userId: string; name: string | null; role: string; rsvpStatus: string; respondedAt: string | null }>;
        activityFeed: Array<{ userId: string; name: string | null; rsvpStatus: string; at: string | null }>;
      }>(`/api/motives/${id}`);
      const mappedActivity: ActivityItem[] = (data.activityFeed ?? []).map(item => ({
        id: item.userId,
        type: item.rsvpStatus as ActivityItem['type'],
        actorName: item.name,
        createdAt: item.at ?? new Date().toISOString(),
      }));
      return { ...data.motive, attendees: (data.attendees ?? []) as Attendee[], activity: mappedActivity } as MotiveDetail;
    },
    enabled: !!id,
  });

  const { data: memoryData } = useQuery({
    queryKey: ['motive-memory', id],
    queryFn: () => getMyMemory(id!),
    enabled: !!id,
  });
  const myMemory: MyMemory | null = memoryData?.memory ?? null;

  useEffect(() => {
    if (!motive || !user?.id) return;
    const me = motive.attendees.find(a => a.userId === user.id);
    if (me) setMyRsvp(me.rsvpStatus as RsvpStatus);
  }, [motive, user?.id]);

  const handleRsvp = async (status: RsvpStatus) => {
    if (rsvpLoading || !id) return;
    const prev = myRsvp;
    setRsvpLoading(true);
    setMyRsvp(status);
    try {
      await apiFetch(`/api/motives/${id}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      refetch();
    } catch (err) {
      log.error('rsvp failed', err, { motiveId: id, status });
      setMyRsvp(prev);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleConfirm = async (happened: boolean) => {
    if (!motive) return;
    setConfirming(true);
    try {
      await confirmMotive(motive.id, happened);
      if (happened) {
        refetch();
        router.push(Routes.motiveMemory(motive.id));
      } else {
        refetch();
      }
    } catch (err) {
      log.error(`confirm motive (${happened ? 'happened' : 'cancelled'}) failed`, err, { motiveId: motive.id });
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  if (isError || !motive) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Something went wrong</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cat = CATEGORY_MAP[motive.category as keyof typeof CATEGORY_MAP]
    ?? { label: motive.category, color: C.textTertiary, emoji: '•', tint: 'rgba(150,150,150,0.08)' };
  const scheduledInPast = motive.scheduledAt ? new Date(motive.scheduledAt) < new Date() : false;
  const isPast = motive.status === 'past' || motive.status === 'completed' || motive.status === 'cancelled' || scheduledInPast;
  // Needs confirmation: scheduled time has passed but status hasn't been updated yet
  const needsConfirmation = scheduledInPast && (motive.status === 'planning' || motive.status === 'confirmed');
  const isDraft = motive.status === 'planning';
  const isOrganiser = user?.id
    ? motive.attendees.find(a => a.userId === user.id)?.role === 'organiser'
    : false;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Back nav */}
        <View style={styles.backNav}>
          <BackButton variant="light" />
          <Text style={styles.backLabel}>Motives</Text>
        </View>

        {/* Hero section */}
        <Animated.View entering={FadeInDown.springify()} style={styles.hero}>
          {/* Category accent bar */}
          <View style={[styles.heroAccent, { backgroundColor: cat.color }]} />

          <View style={styles.catRow}>
            <Text style={[styles.catLabel, { color: cat.color }]}>{cat.emoji} {cat.label}</Text>
            {isDraft && (
              <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeText}>DRAFT</Text>
              </View>
            )}
            {isPast && (
              <View style={styles.pastBadge}>
                <Text style={styles.pastBadgeText}>PAST</Text>
              </View>
            )}
          </View>
          <Text style={styles.heroTitle}>{motive.title}</Text>
          <Text style={styles.heroDate}>{formatFullDate(motive.scheduledAt)}</Text>
          {motive.venueName && (
            <View style={styles.heroVenueRow}>
              <Text style={styles.heroAddress}>{motive.placeAddress ?? motive.venueName}</Text>
            </View>
          )}
          {motive.note ? (
            <Text style={styles.heroNote}>{motive.note}</Text>
          ) : null}
        </Animated.View>

        {/* RSVP section */}
        {!isPast && (
          <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.rsvpSection}>
            <RsvpButtons
              myRsvp={myRsvp}
              isOrganiser={isOrganiser}
              rsvpLoading={rsvpLoading}
              onRsvp={handleRsvp}
              motiveId={motive.id}
              router={router}
            />
          </Animated.View>
        )}

        {/* Confirmation prompt — shown when scheduled time has passed but status not yet updated */}
        <ConfirmationBanner
          visible={needsConfirmation}
          confirming={confirming}
          onConfirm={handleConfirm}
          motiveTitle={motive.title}
        />

        {/* Post-motive memory banner — only shown once confirmed */}
        {isPast && !needsConfirmation && (
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Pressable
              onPress={() => router.push(Routes.motiveMemory(motive.id))}
              style={styles.memoryBanner}
            >
              <View style={styles.memoryIcon}>
                <Text style={styles.memoryIconText}>📸</Text>
              </View>
              <View style={styles.memoryInfo}>
                {myMemory ? (
                  <>
                    <Text style={styles.memoryTitle}>Your memories</Text>
                    <Text style={styles.memorySubtitle} numberOfLines={1}>
                      {myMemory.photos.length} photo{myMemory.photos.length !== 1 ? 's' : ''}
                      {myMemory.rating ? ` · ${'★'.repeat(myMemory.rating)}` : ''}
                      {myMemory.vibeTags.length > 0 ? ` · ${myMemory.vibeTags[0]}` : ''}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.memoryTitle}>Add your memories</Text>
                    <Text style={styles.memorySubtitle} numberOfLines={1}>
                      From {motive.title}
                    </Text>
                  </>
                )}
              </View>
              <Text style={styles.memoryArrow}>›</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Attendees section */}
        {motive.attendees.length > 0 && (
          <AttendeeSection
            attendees={motive.attendees}
            myId={user?.id ?? ''}
          />
        )}

        {/* Activity section */}
        {motive.activity.length > 0 && (
          <Animated.View entering={FadeInDown.delay(180).springify()}>
            <Text style={styles.sectionHeader}>ACTIVITY</Text>
            <View style={styles.activityList}>
              {motive.activity.map(item => (
                <View key={item.id} style={styles.activityRow}>
                  <View style={[styles.activityDot, { backgroundColor: activityDot(item.type) }]} />
                  <Text style={styles.activityText}>{activityText(item)}</Text>
                  <Text style={styles.activityTime}>{relativeTime(item.createdAt)}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: Fonts.body,
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
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: C.text,
  },
  // Back nav
  backNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backLabel: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textTertiary,
    marginLeft: 10,
  },
  // Hero
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 22,
    paddingTop: 0,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    overflow: 'hidden',
  },
  heroAccent: {
    height: 3,
    marginHorizontal: -24,
    marginBottom: 16,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  catLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  draftBadge: {
    backgroundColor: 'rgba(100,136,200,0.12)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(100,136,200,0.3)',
  },
  draftBadgeText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: '#6488C8',
    letterSpacing: 0.6,
  },
  pastBadge: {
    backgroundColor: 'rgba(150,150,150,0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pastBadgeText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textTertiary,
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontFamily: Fonts.headingRegular,
    fontStyle: 'italic',
    fontSize: 26,
    color: C.text,
    marginTop: 6,
    lineHeight: 32,
  },
  heroDate: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.text,
    marginTop: 10,
    letterSpacing: -0.2,
  },
  heroVenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  heroAddress: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textSecondary,
    flex: 1,
  },
  heroNote: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    borderLeftWidth: 2,
    borderLeftColor: C.border,
    paddingLeft: 10,
  },
  // RSVP wrapper
  rsvpSection: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  // Memory banner
  memoryBanner: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: C.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  memoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryIconText: {
    fontSize: 20,
  },
  memoryInfo: {
    flex: 1,
  },
  memoryTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.text,
  },
  memorySubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.textTertiary,
    marginTop: 2,
  },
  memoryArrow: {
    fontSize: 18,
    color: C.textTertiary,
    lineHeight: 22,
  },
  // Section headers
  sectionHeader: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textTertiary,
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 0,
  },
  // Activity
  activityList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },
  activityText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textSecondary,
    flex: 1,
    marginLeft: 10,
    lineHeight: 18,
  },
  activityTime: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    marginLeft: 8,
  },
});
