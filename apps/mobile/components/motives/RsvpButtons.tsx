import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { C, Fonts } from '../../constants/theme';
import { Routes } from '../../lib/routes';
import { apiFetch } from '../../lib/api';

type RsvpStatus = 'going' | 'maybe' | 'declined' | 'invited';

type Props = {
  myRsvp: RsvpStatus | null;
  isOrganiser: boolean;
  rsvpLoading: boolean;
  onRsvp: (status: 'going' | 'maybe' | 'declined') => void;
  motiveId: string;
  router: { push: (route: any) => void; back: () => void };
};

export function RsvpButtons({
  myRsvp,
  isOrganiser,
  rsvpLoading,
  onRsvp,
  motiveId,
  router,
}: Props) {
  if (isOrganiser) {
    return (
      <>
        {/* Organizer RSVP — they can step back without cancelling */}
        <TouchableOpacity
          onPress={() => onRsvp('going')}
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
            onPress={() => onRsvp('maybe')}
            disabled={rsvpLoading}
            style={[styles.maybeBtn, myRsvp === 'maybe' && styles.maybeBtnActive]}
          >
            <Text style={[styles.maybeBtnText, myRsvp === 'maybe' && styles.maybeBtnTextActive]}>Maybe</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onRsvp('declined')}
            disabled={rsvpLoading}
            style={[styles.maybeBtn, myRsvp === 'declined' && styles.maybeBtnActive]}
          >
            <Text style={[styles.maybeBtnText, myRsvp === 'declined' && styles.maybeBtnTextActive]}>
              Can&apos;t make it
            </Text>
          </TouchableOpacity>
        </View>
        {/* Organizer admin actions */}
        <View style={[styles.organiserRow, { marginTop: 8 }]}>
          <TouchableOpacity
            onPress={() => router.push(Routes.motiveEdit(motiveId))}
            style={styles.organiserBtn}
          >
            <Text style={styles.organiserBtnText}>Edit motive</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                'Cancel motive',
                'This will cancel the motive and notify all attendees.',
                [
                  { text: 'Keep it', style: 'cancel' },
                  {
                    text: 'Cancel motive',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await apiFetch(`/api/motives/${motiveId}`, { method: 'DELETE' });
                        router.back();
                      } catch {
                        Alert.alert('Error', 'Could not cancel motive. Please try again.');
                      }
                    },
                  },
                ],
              );
            }}
            style={styles.cancelBtn}
          >
            <Text style={styles.cancelBtnText}>Cancel motive</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => onRsvp('going')}
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
          onPress={() => onRsvp('maybe')}
          disabled={rsvpLoading}
          style={[styles.maybeBtn, myRsvp === 'maybe' && styles.maybeBtnActive]}
        >
          <Text style={[styles.maybeBtnText, myRsvp === 'maybe' && styles.maybeBtnTextActive]}>
            Maybe
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onRsvp('declined')}
          disabled={rsvpLoading}
          style={[styles.maybeBtn, myRsvp === 'declined' && styles.maybeBtnActive]}
        >
          <Text style={[styles.maybeBtnText, myRsvp === 'declined' && styles.maybeBtnTextActive]}>
            Can&apos;t make it
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
});
