import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { C, Fonts } from '../../../constants/theme';
import { PlaceDetail } from '../../../lib/api';
import { CATEGORY_MAP, CategoryKey } from '../../../constants/motives';
import { Avatar } from '../../ui/Avatar';
import { formatDateFull } from './DatePickerModal';

type CatKey = CategoryKey;

function getCat(key: string) {
  return CATEGORY_MAP[key as CatKey] ?? { label: key, color: C.textTertiary, emoji: '•', tint: 'rgba(150,150,150,0.08)' };
}

type Person = {
  id: string;
  name: string | null;
  username: string | null;
};

// ─── Step4Review ──────────────────────────────────────────────────────────────

export function Step4Review({
  category,
  title,
  date,
  selectedPlace,
  selectedPeople,
  onSubmit,
  onDraft,
  submitting,
  error,
  insetBottom,
}: {
  category: CatKey | null;
  title: string;
  date: Date | null;
  selectedPlace: PlaceDetail | null;
  selectedPeople: Person[];
  onSubmit: () => void;
  onDraft: () => void;
  submitting: boolean;
  error: string | null;
  insetBottom: number;
}) {
  const cat = category ? getCat(category) : null;

  return (
    <ScrollView
      style={styles.stepRoot}
      contentContainerStyle={{ paddingBottom: insetBottom + 120 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.stepTitle, { marginBottom: 24 }]}>Review</Text>

      {/* Preview card */}
      <View style={styles.reviewCard}>
        {cat && <View style={[styles.reviewCardAccent, { backgroundColor: cat.color }]} />}
        <View style={styles.reviewCardContent}>
          {cat && (
            <Text style={[styles.reviewCatLabel, { color: cat.color }]}>
              {cat.label.toUpperCase()}
            </Text>
          )}
          <Text style={styles.reviewTitle}>{title}</Text>
          <Text style={styles.reviewDate}>{date ? formatDateFull(date) : 'Date TBD'}</Text>
          {selectedPlace && (
            <Text style={styles.reviewAddress}>{selectedPlace.name}</Text>
          )}
          {selectedPlace?.address ? (
            <Text style={[styles.reviewAddress, { fontSize: 11, opacity: 0.7 }]}>{selectedPlace.address}</Text>
          ) : null}
          {selectedPeople.length > 0 && (
            <>
              <View style={styles.reviewAvatarRow}>
                {selectedPeople.slice(0, 5).map((p, i) => (
                  <Avatar
                    key={p.id}
                    name={p.name ?? undefined}
                    userId={p.id}
                    size="xs"
                    style={[styles.reviewAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }]}
                  />
                ))}
              </View>
              <Text style={styles.reviewNames}>
                {selectedPeople.slice(0, 3).map(p => p.name?.split(' ')[0]).join(', ')}
                {selectedPeople.length > 3 ? ` +${selectedPeople.length - 3}` : ''}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Inline error */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="info-outline" size={16} color="#C84B4B" />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* Actions */}
      <TouchableOpacity
        onPress={onSubmit}
        style={[styles.reviewPrimary, { marginTop: error ? 12 : 24 }, submitting && { opacity: 0.7 }]}
        activeOpacity={0.85}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.reviewPrimaryText}>Send invites</Text>
        }
      </TouchableOpacity>
      <TouchableOpacity onPress={onDraft} style={styles.reviewDraft} disabled={submitting}>
        <Text style={styles.reviewDraftText}>Save as draft</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stepRoot: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: 'Fraunces_400Regular',
    fontStyle: 'italic',
    fontSize: 26,
    color: C.text,
    paddingHorizontal: 24,
    marginTop: 28,
    marginBottom: 4,
    lineHeight: 32,
  },
  reviewCard: {
    backgroundColor: '#181614',
    borderRadius: 18,
    marginHorizontal: 20,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  reviewCardAccent: {
    width: 4,
  },
  reviewCardContent: {
    flex: 1,
    paddingLeft: 24,
    paddingRight: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  reviewCatLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  reviewTitle: {
    fontFamily: 'Fraunces_400Regular',
    fontStyle: 'italic',
    fontSize: 22,
    color: C.textInverse,
    marginTop: 8,
    lineHeight: 28,
  },
  reviewDate: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
  },
  reviewAddress: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 3,
  },
  reviewAvatarRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  reviewAvatar: {
    borderWidth: 1.5,
    borderColor: C.text,
  },
  reviewNames: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(200,75,75,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,75,75,0.25)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginTop: 20,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: '#C84B4B',
    lineHeight: 18,
  },
  reviewPrimary: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
  },
  reviewPrimaryText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.textInverse,
  },
  reviewDraft: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  reviewDraftText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textTertiary,
  },
});
