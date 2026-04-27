import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Modal, RefreshControl, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../../../constants/theme';
import { Avatar } from '../../../../components/ui/Avatar';
import { getProfileCircles, getCircleByCode, joinCircle, ProfileCircle } from '../../../../lib/api';

const C = Colors.light;

export default function CirclesScreen() {
  const insets = useSafeAreaInsets();
  const [joined, setJoined]           = useState<ProfileCircle[]>([]);
  const [code, setCode]               = useState('');
  const [codeError, setCodeError]     = useState('');
  const [joining, setJoining]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [confirmCircle, setConfirmCircle] = useState<{
    name: string; memberCount: number; status: 'active' | 'pending';
  } | null>(null);

  const loadData = useCallback(async () => {
    const result = await getProfileCircles().catch(() => null);
    if (result) setJoined(result.joined);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  async function handleRefresh() { setRefreshing(true); await loadData(); setRefreshing(false); }

  async function handleJoinByCode() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) { setCodeError('Enter a 6-character code'); return; }
    setJoining(true); setCodeError('');
    try {
      const circle = await getCircleByCode(trimmed);
      const result = await joinCircle(circle.id);
      setConfirmCircle({ name: circle.name, memberCount: result.memberCount, status: result.status });
      setCode('');
      await loadData();
    } catch {
      setCodeError("That code doesn't exist. Check and try again.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={styles.chevron} />
        </TouchableOpacity>
        <Text style={styles.title}>Circles</Text>
        {/* Create circle button */}
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => router.push('/(app)/(tabs)/profile/create-circle' as any)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.createLabel}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
      >
        {/* Joined circles */}
        {joined.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>JOINED · {joined.length}</Text>
            {joined.map(ci => (
              <TouchableOpacity
                key={ci.id}
                style={styles.circleCard}
                onPress={() => router.push({ pathname: '/(app)/(tabs)/profile/circle-detail', params: { id: ci.id } } as any)}
                activeOpacity={0.8}
              >
                <View style={[styles.circleIcon, { backgroundColor: ci.categoryColor }]}>
                  <Text style={{ fontSize: 18 }}>{ci.categoryEmoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.circleName}>{ci.name}</Text>
                  <Text style={styles.circleMeta}>
                    {ci.memberCount} members
                    {ci.friendsInsideCount > 0
                      ? ` · ${ci.friendsInsideCount} friend${ci.friendsInsideCount > 1 ? 's' : ''} inside`
                      : ''}
                  </Text>
                </View>
                {/* Member previews */}
                {ci.memberPreviews.length > 0 && (
                  <View style={styles.memberStrip}>
                    {ci.memberPreviews.slice(0, 3).map((m, i) => (
                      <Avatar
                        key={m.id}
                        name={m.name}
                        userId={m.id}
                        uri={m.image}
                        size="xs"
                        style={[styles.memberAvatar, i > 0 && { marginLeft: -6 }]}
                      />
                    ))}
                    {ci.memberCount > 3 && (
                      <Text style={styles.memberMore}>+{ci.memberCount - 3}</Text>
                    )}
                  </View>
                )}
                <View style={styles.rowChevron} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Create a circle CTA */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>START SOMETHING</Text>
          <TouchableOpacity
            style={styles.createCard}
            onPress={() => router.push('/(app)/(tabs)/profile/create-circle' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.createCardIcon}>
              <View style={styles.createCardPlus} />
              <View style={styles.createCardPlusH} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.createCardTitle}>Create a circle</Text>
              <Text style={styles.createCardSub}>Start a group for your community, club, or crew</Text>
            </View>
            <View style={styles.rowChevron} />
          </TouchableOpacity>
        </View>

        {/* Join by code */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>JOIN A CIRCLE</Text>
          <View style={styles.joinRow}>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={t => { setCode(t.toUpperCase()); setCodeError(''); }}
              placeholder="Enter 6-character code"
              placeholderTextColor={C.textTertiary}
              autoCapitalize="characters"
              maxLength={6}
              returnKeyType="go"
              onSubmitEditing={handleJoinByCode}
            />
            <TouchableOpacity
              style={[styles.joinBtn, (joining || code.trim().length < 6) && styles.joinBtnDisabled]}
              onPress={handleJoinByCode}
              disabled={joining || code.trim().length < 6}
            >
              <Text style={styles.joinBtnText}>{joining ? '…' : 'Join'}</Text>
            </TouchableOpacity>
          </View>
          {codeError ? <Text style={styles.codeError}>{codeError}</Text> : null}
        </View>

        {joined.length === 0 && (
          <Text style={styles.emptyText}>
            You haven't joined any circles yet.{'\n'}Create one or enter a code to get started.
          </Text>
        )}
      </ScrollView>

      {/* Join confirmation modal */}
      {confirmCircle && (
        <Modal visible animationType="fade" transparent statusBarTranslucent>
          <View style={styles.overlay}>
            <Text style={styles.confirmBadge}>
              {confirmCircle.status === 'active' ? "YOU'RE IN ✦" : 'REQUEST SENT'}
            </Text>
            <Text style={styles.confirmName}>{confirmCircle.name}</Text>
            <Text style={styles.confirmCount}>
              {confirmCircle.status === 'active'
                ? `${confirmCircle.memberCount} members now in your circle`
                : 'The admin will review your request.'}
            </Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={() => setConfirmCircle(null)}>
              <Text style={styles.confirmBtnText}>Back to circles</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.backgroundWarm },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 8,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  chevron: {
    width: 9, height: 9,
    borderLeftWidth: 2, borderBottomWidth: 2,
    borderColor: C.textSecondary,
    transform: [{ rotate: '45deg' }],
    marginLeft: 3,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    color: C.text,
    fontStyle: 'italic',
    letterSpacing: -0.5,
    flex: 1,
  },
  createBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: '#fff',
    letterSpacing: 0.2,
  },

  // Sections
  section: { marginHorizontal: 16, marginTop: 6, marginBottom: 8 },
  sectionLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textTertiary,
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 2,
  },

  // Circle card
  circleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.borderWarm,
    padding: 13,
    marginBottom: 8,
    shadowColor: C.cardShadowColor,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  circleIcon: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  circleName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.text,
    marginBottom: 2,
  },
  circleMeta: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
  },
  memberStrip: { flexDirection: 'row', alignItems: 'center' },
  memberAvatar: { borderWidth: 2, borderColor: C.surface },
  memberMore: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: C.textTertiary,
    marginLeft: 4,
  },
  rowChevron: {
    width: 7, height: 7,
    borderRightWidth: 2, borderTopWidth: 2,
    borderColor: C.border,
    transform: [{ rotate: '45deg' }],
    flexShrink: 0,
  },

  // Create circle card
  createCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,107,53,0.2)',
    borderStyle: 'dashed',
    padding: 15,
    marginBottom: 8,
  },
  createCardIcon: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: 'rgba(255,107,53,0.08)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  createCardPlus: {
    width: 14, height: 2.5,
    backgroundColor: C.primary,
    borderRadius: 1.5,
    position: 'absolute',
  },
  createCardPlusH: {
    width: 2.5, height: 14,
    backgroundColor: C.primary,
    borderRadius: 1.5,
    position: 'absolute',
  },
  createCardTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.text,
    marginBottom: 2,
  },
  createCardSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textSecondary,
    lineHeight: 15,
  },

  // Join by code
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  codeInput: {
    flex: 1,
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.text,
    letterSpacing: 4,
  },
  joinBtn: {
    backgroundColor: C.text,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  joinBtnDisabled: { opacity: 0.35 },
  joinBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.textInverse,
  },
  codeError: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.error,
    marginTop: 6,
    marginLeft: 2,
  },

  // Empty
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginTop: 24,
    lineHeight: 20,
  },

  // Confirmation modal
  overlay: {
    flex: 1,
    backgroundColor: '#100D0B',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  confirmBadge: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.primary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  confirmName: {
    fontFamily: Fonts.heading,
    fontSize: 26,
    color: '#F2E8DC',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  confirmCount: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(242,232,220,0.45)',
    marginBottom: 32,
    textAlign: 'center',
  },
  confirmBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 15,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  confirmBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: 'rgba(242,232,220,0.5)',
  },
});
