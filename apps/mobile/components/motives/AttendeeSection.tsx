import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { C, Fonts } from '../../constants/theme';
import { Avatar } from '../ui/Avatar';

// ─── Types ────────────────────────────────────────────────────────────────────
type RsvpStatus = 'invited' | 'going' | 'maybe' | 'declined';

export type Attendee = {
  userId: string;
  name: string | null;
  role: string;
  rsvpStatus: RsvpStatus;
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<RsvpStatus, { label: string; icon: string; color: string; bg: string }> = {
  going:    { label: 'Going',         icon: '✓', color: '#4CAF81',       bg: 'rgba(76,175,129,0.12)' },
  maybe:    { label: 'Maybe',         icon: '~', color: '#F5A623',       bg: 'rgba(245,166,35,0.12)' },
  declined: { label: "Can't make it", icon: '✕', color: C.error,         bg: 'rgba(230,57,70,0.10)' },
  invited:  { label: 'Awaiting',      icon: '…', color: C.textTertiary,  bg: 'rgba(150,150,150,0.10)' },
};

// ─── Attendee row (list style) ────────────────────────────────────────────────
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
export function AttendeeSection({ attendees, myId }: { attendees: Attendee[]; myId: string }) {
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

const styles = StyleSheet.create({
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
});
