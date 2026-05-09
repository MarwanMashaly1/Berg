import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Fonts } from '../../../../constants/theme';
import { CATEGORY_MAP } from '../../../../constants/motives';
import { Avatar } from '../../../../components/ui/Avatar';
import { BackButton } from '../../../../components/ui/BackButton';
import { authClient } from '../../../../lib/auth';
import { apiFetch, confirmMotive, getMyMemory, type MyMemory } from '../../../../lib/api';

const C = Colors.light;

// ─── Types ────────────────────────────────────────────────────────────────────
// Backend sends: 'invited' | 'going' | 'maybe' | 'declined'
type RsvpStatus = 'invited' | 'going' | 'maybe' | 'declined';
type Attendee = {
  userId: string;
  name: string | null;
  role: string;
  rsvpStatus: RsvpStatus;
};
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

// ─── Attendee row (list style) ────────────────────────────────────────────────
const STATUS_CONFIG: Record<RsvpStatus, { label: string; icon: string; color: string; bg: string }> = {
  going:    { label: 'Going',         icon: '✓', color: '#4CAF81',       bg: 'rgba(76,175,129,0.12)' },
  maybe:    { label: 'Maybe',         icon: '~', color: '#F5A623',       bg: 'rgba(245,166,35,0.12)' },
  declined: { label: "Can't make it", icon: '✕', color: C.error,         bg: 'rgba(230,57,70,0.10)' },
  invited:  { label: 'Awaiting',      icon: '…', color: C.textTertiary,  bg: 'rgba(150,150,150,0.10)' },
};

function AttendeeRow({ attendee, isMe }: { attendee: Attendee; isMe: boolean }) {
  const cfg = STATUS_CONFIG[attendee.rsvpStatus] ?? STATUS_CONFIG.invited;

  return (
    <View style={styles.attendeeRow}>
      <Avatar name={attendee.name} userId={attendee.userId} size="sm" />
      <View style={styles.attendeeRowBody}>
        <Text style={styles.attendeeRowName}>
          {attendee.name ?? 'Guest'}
          {isMe && <Text style={styles.attendeeYou}> (you)</Text>}
          {attendee.role === 'organiser' && <Text style={styles.attendeeOrg}> · organiser</Text>}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
        <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    </View>
  );
}

// ─── Grouped attendees section ────────────────────────────────────────────────
function AttendeesSection({ attendees, myId }: { attendees: Attendee[]; myId: string }) {
  const going    = attendees.filter(a => a.rsvpStatus === 'going');
  const maybe    = attendees.filter(a => a.rsvpStatus === 'maybe');
  const pending  = attendees.filter(a => a.rsvpStatus === 'invited');
  const declined = attendees.filter(a => a.rsvpStatus === 'declined');

  const groups = [
    { key: 'going',    label: 'Going',          color: '#4CAF81', list: going },
    { key: 'maybe',    label: 'Maybe',           color: '#F5A623', list: maybe },
    { key: 'pending',  label: 'Awaiting reply',  color: C.textTertiary, list: pending },
    { key: 'declined', label: "Can't make it",   color: C.error,   list: declined },
  ].filter(g => g.list.length > 0);

  // Summary counts
  const goingCount = going.length;
  const maybeCount = maybe.length;
  const pendingCount = pending.length;

  return (
    <Animated.View entering={FadeInDown.delay(140).springify()}>
      <View style={styles.attendeesHeader}>
        <Text style={styles.sectionHeader}>PEOPLE</Text>
        <Text style={styles.attendeesSummary}>
          {goingCount > 0 && `${goingCount} going`}
          {goingCount > 0 && maybeCount > 0 && ' · '}
          {maybeCount > 0 && `${maybeCount} maybe`}
          {(goingCount > 0 || maybeCount > 0) && pendingCount > 0 && ' · '}
          {pendingCount > 0 && `${pendingCount} pending`}
        </Text>
      </View>

      <View style={styles.attendeesList}>
        {groups.map(group => (
          <View key={group.key}>
            <View style={styles.groupLabel}>
              <View style={[styles.groupDot, { backgroundColor: group.color }]} />
              <Text style={[styles.groupLabelText, { color: group.color }]}>
                {group.label} · {group.list.length}
              </Text>
            </View>
            {group.list.map(a => (
              <AttendeeRow key={a.userId} attendee={a} isMe={a.userId === myId} />
            ))}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MotiveDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = authClient.useSession();
  const [motive, setMotive] = useState<MotiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myRsvp, setMyRsvp] = useState<RsvpStatus | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [myMemory, setMyMemory] = useState<MyMemory | null>(null);

  const fetchMotive = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setLoading(true);
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

      const assembled: MotiveDetail = {
        ...data.motive,
        attendees: (data.attendees ?? []) as Attendee[],
        activity: mappedActivity,
      };
      setMotive(assembled);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMotive();
  }, [fetchMotive]);

  // Load existing memory to update banner
  useEffect(() => {
    if (!id) return;
    getMyMemory(id).then(res => setMyMemory(res.memory)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!motive || !session?.user?.id) return;
    const me = motive.attendees.find(a => a.userId === session.user.id);
    if (me) setMyRsvp(me.rsvpStatus as RsvpStatus);
  }, [motive, session?.user?.id]);

  const handleRsvp = async (status: RsvpStatus) => {
    if (rsvpLoading || !id) return;
    const prev = myRsvp;
    setRsvpLoading(true);
    setMyRsvp(status);
    // Patch attendee in motive state immediately so the attendee list reflects change
    if (session?.user?.id) {
      setMotive(prev => prev ? {
        ...prev,
        attendees: prev.attendees.map(a =>
          a.userId === session.user.id ? { ...a, rsvpStatus: status } : a
        ),
      } : prev);
    }
    try {
      await apiFetch(`/api/motives/${id}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
    } catch {
      setMyRsvp(prev);
      // Revert attendee state on failure
      if (session?.user?.id && prev) {
        setMotive(m => m ? {
          ...m,
          attendees: m.attendees.map(a =>
            a.userId === session.user.id ? { ...a, rsvpStatus: prev } : a
          ),
        } : m);
      }
    } finally {
      setRsvpLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  if (error || !motive) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Something went wrong</Text>
        <TouchableOpacity onPress={fetchMotive} style={styles.retryBtn}>
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
  const isOrganiser = session?.user?.id
    ? motive.attendees.find(a => a.userId === session.user.id)?.role === 'organiser'
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
            {isOrganiser ? (
              <View style={styles.organiserRow}>
                <TouchableOpacity
                  onPress={() => router.push(`/(app)/(tabs)/motives/${motive.id}/edit` as any)}
                  style={styles.organiserBtn}
                >
                  <Text style={styles.organiserBtnText}>Edit motive</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await apiFetch(`/api/motives/${id}`, { method: 'DELETE' });
                      router.back();
                    } catch {}
                  }}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel motive</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => handleRsvp('going')}
                  disabled={rsvpLoading}
                  style={[
                    styles.goingBtn,
                    myRsvp === 'going' && styles.goingBtnActive,
                    rsvpLoading && { opacity: 0.6 },
                  ]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.goingBtnText, myRsvp === 'going' && styles.goingBtnTextActive]}>
                    {myRsvp === 'going' ? 'Going ✓' : "I'm going"}
                  </Text>
                </TouchableOpacity>
                <View style={styles.maybeRow}>
                  <TouchableOpacity
                    onPress={() => handleRsvp('maybe')}
                    disabled={rsvpLoading}
                    style={[styles.maybeBtn, myRsvp === 'maybe' && styles.maybeBtnActive]}
                  >
                    <Text style={[styles.maybeBtnText, myRsvp === 'maybe' && styles.maybeBtnTextActive]}>
                      Maybe
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRsvp('declined')}
                    disabled={rsvpLoading}
                    style={[styles.maybeBtn, myRsvp === 'declined' && styles.maybeBtnActive]}
                  >
                    <Text style={[styles.maybeBtnText, myRsvp === 'declined' && styles.maybeBtnTextActive]}>
                      Can&apos;t make it
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Animated.View>
        )}

        {/* Confirmation prompt — shown when scheduled time has passed but status not yet updated */}
        {needsConfirmation && (
          <Animated.View entering={FadeInDown.springify()} style={styles.confirmBanner}>
            <Text style={styles.confirmQuestion}>Did this happen?</Text>
            <Text style={styles.confirmSub}>{motive.title}</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnYes, confirming && { opacity: 0.5 }]}
                disabled={confirming}
                onPress={async () => {
                  setConfirming(true);
                  try {
                    await confirmMotive(motive.id, true);
                    // Reload to show updated status + memory flow
                    fetchMotive();
                    router.push(`/(app)/(tabs)/motives/${motive.id}/memory` as any);
                  } catch { /* ignore */ }
                  finally { setConfirming(false); }
                }}
              >
                <Text style={styles.confirmBtnYesText}>Yes, it happened</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnNo, confirming && { opacity: 0.5 }]}
                disabled={confirming}
                onPress={async () => {
                  setConfirming(true);
                  try {
                    await confirmMotive(motive.id, false);
                    fetchMotive();
                  } catch { /* ignore */ }
                  finally { setConfirming(false); }
                }}
              >
                <Text style={styles.confirmBtnNoText}>No, it was cancelled</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Post-motive memory banner — only shown once confirmed */}
        {isPast && !needsConfirmation && (
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Pressable
              onPress={() => router.push(`/(app)/(tabs)/motives/${motive.id}/memory` as any)}
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
          <AttendeesSection
            attendees={motive.attendees}
            myId={session?.user?.id ?? ''}
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
  // RSVP
  rsvpSection: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  goingBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goingBtnActive: {
    backgroundColor: C.secondary,
  },
  goingBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.textInverse,
  },
  goingBtnTextActive: {
    color: C.textInverse,
  },
  maybeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  maybeBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maybeBtnActive: {
    borderWidth: 1.5,
    borderColor: C.primary,
    backgroundColor: 'rgba(255,107,53,0.06)',
  },
  maybeBtnText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.text,
  },
  maybeBtnTextActive: {
    color: C.primary,
    fontFamily: Fonts.bodySemiBold,
  },
  // Organiser actions
  organiserRow: {
    gap: 10,
  },
  organiserBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  organiserBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: '#fff',
  },
  cancelBtn: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.error,
    opacity: 0.7,
  },
  // Confirmation prompt
  confirmBanner: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#1A1512',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
  },
  confirmQuestion: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    color: '#F2E8DC',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  confirmSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(242,232,220,0.45)',
    marginBottom: 18,
  },
  confirmBtns: { gap: 10 },
  confirmBtn: {
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnYes: {
    backgroundColor: C.primary,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  confirmBtnNo: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  confirmBtnYesText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: '#fff',
  },
  confirmBtnNoText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: 'rgba(242,232,220,0.45)',
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
  // Attendees
  attendeesHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginTop: 24, marginBottom: 4,
  },
  attendeesSummary: {
    fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary,
  },
  attendeesList: {
    marginHorizontal: 20, marginTop: 4,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 14, overflow: 'hidden',
  },
  groupLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
    backgroundColor: C.surfaceAlt,
  },
  groupDot: { width: 6, height: 6, borderRadius: 3 },
  groupLabelText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.4 },
  attendeeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: C.surface,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  attendeeRowBody: { flex: 1 },
  attendeeRowName: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.text },
  attendeeYou: { fontFamily: Fonts.body, color: C.textTertiary, fontSize: 12 },
  attendeeOrg: { fontFamily: Fonts.body, color: C.primary, fontSize: 12 },
  statusPill: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  statusPillText: { fontFamily: Fonts.bodySemiBold, fontSize: 11 },
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
