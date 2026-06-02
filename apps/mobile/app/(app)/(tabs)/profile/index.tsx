import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { authClient } from '../../../../lib/auth';
import { useCurrentUser } from '../../../../hooks/use-current-user';
import { C, Fonts } from '../../../../constants/theme';
import { Routes } from '../../../../lib/routes';
import { Avatar } from '../../../../components/ui/Avatar';
import {
  getProfileStats, getProfileConnections, getProfileCircles, getInviteLink, getUserMe,
  patchUser,
} from '../../../../lib/api';
import { QK } from '../../../../lib/hooks/queries';
import { CircleIcon } from '../../../../components/ui/CircleIcon';
import { QrModal } from '../../../../components/profile/QrModal';
import { AvailabilityPicker, AVAIL_OPTIONS } from '../../../../components/profile/AvailabilityPicker';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useCurrentUser();
  const user = currentUser as any;
  const qc = useQueryClient();

  const [showQR, setShowQR] = useState(false);
  const [showAvailPicker, setShowAvailPicker] = useState(false);
  const [availability, setAvailability] = useState<string>(user?.availabilityStatus ?? 'down_to_hang');

  const enabled = !!currentUser;
  const { data: statsData, isLoading: statsLoading, isRefetching: statsRefetching, refetch: refetchStats } = useQuery({
    queryKey: QK.profileStats(), queryFn: () => getProfileStats(), enabled,
  });
  const { data: connectionsData, isLoading: connsLoading, refetch: refetchConns } = useQuery({
    queryKey: QK.connections(), queryFn: () => getProfileConnections(), enabled,
  });
  const { data: circlesData, isLoading: circlesLoading, refetch: refetchCircles } = useQuery({
    queryKey: QK.circles(), queryFn: () => getProfileCircles(), enabled,
  });
  const { data: inviteLinkData } = useQuery({
    queryKey: ['invite-link'], queryFn: () => getInviteLink(), enabled, staleTime: Infinity,
  });
  const { data: profileDataRes, isLoading: profileLoading } = useQuery({
    queryKey: QK.profile(), queryFn: () => getUserMe(), enabled, staleTime: 2 * 60 * 1000,
  });

  const loading = statsLoading || connsLoading || circlesLoading || profileLoading;
  const isRefetching = statsRefetching;
  const stats = statsData ?? null;
  const connections = connectionsData?.confirmed.slice(0, 4) ?? [];
  const pendingCount = connectionsData?.pending.length ?? 0;
  const circles = circlesData?.joined.slice(0, 3) ?? [];
  const inviteLink = inviteLinkData ?? null;
  const profileData = profileDataRes?.user ?? null;

  useEffect(() => {
    if (profileData?.availabilityStatus) setAvailability(profileData.availabilityStatus);
  }, [profileData?.availabilityStatus]);

  // Data freshness handled by React Query staleTime — no manual focus-refetch needed.

  async function handleRefresh() {
    await Promise.all([refetchStats(), refetchConns(), refetchCircles(), refetchProfile()]);
  }

  async function handleAvailability(value: string) {
    setAvailability(value);
    setShowAvailPicker(false);
    await patchUser({ availabilityStatus: value });
  }

  const currentAvail = AVAIL_OPTIONS.find(o => o.value === availability) ?? AVAIL_OPTIONS[0];
  const displayName = profileData?.displayName ?? profileData?.name ?? user?.name ?? 'Your Name';
  const username = profileData?.username ?? (user as any)?.username;
  const bio = profileData?.bio ?? (user as any)?.bio;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={C.primary} />}
      >
        {/* Dark hero header */}
        <View style={styles.header}>
          {/* Ambient orange glow in top-right corner */}
          <View style={styles.headerGlow} />

          <View style={styles.nameBlock}>
            <Text style={styles.name}>{displayName}</Text>
            {username ? <Text style={styles.username}>@{username}</Text> : null}
            <TouchableOpacity onPress={() => setShowAvailPicker(v => !v)} activeOpacity={0.75}>
              <View style={[styles.availPill, { backgroundColor: currentAvail.bg }]}>
                <View style={[styles.availDot, { backgroundColor: currentAvail.color }]} />
                <Text style={[styles.availText, { color: currentAvail.color }]}>{currentAvail.label}</Text>
              </View>
            </TouchableOpacity>
            {showAvailPicker && (
              <AvailabilityPicker value={availability} onChange={handleAvailability} />
            )}
          </View>
          <View style={styles.avatarBlock}>
            <Avatar
              name={displayName}
              userId={user?.id}
              uri={user?.image}
              size="xl"
              style={styles.avatar}
            />
            <TouchableOpacity style={styles.qrBtn} onPress={() => setShowQR(true)} activeOpacity={0.8}>
              <Text style={styles.qrIcon}>⊞</Text>
              <Text style={styles.qrLabel}>QR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Orange accent rule — sits between dark header and cream body */}
        <View style={styles.rule} />
        {bio ? <Text style={styles.bio}>{bio}</Text> : null}

        {/* Stats row */}
        <View style={styles.statsRow}>
          {loading ? (
            // Skeleton stat cells
            <>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.statCell, i < 2 && { borderRightWidth: 1, borderRightColor: C.border }]}>
                  <View style={{ width: 28, height: 22, backgroundColor: '#E8E0D5', borderRadius: 6, marginBottom: 5 }} />
                  <View style={{ width: 60, height: 10, backgroundColor: '#E8E0D5', borderRadius: 4 }} />
                </View>
              ))}
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.statCell} onPress={() => router.push(Routes.profileConnections)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.statNum}>{stats?.connections ?? '0'}</Text>
                  {pendingCount > 0 && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.statLabel}>Connections</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity style={styles.statCell} onPress={() => router.push(Routes.profileCircles)}>
                <Text style={styles.statNum}>{stats?.circles ?? '0'}</Text>
                <Text style={styles.statLabel}>Circles</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={styles.statNum}>{stats?.motives ?? '0'}</Text>
                <Text style={styles.statLabel}>Motives</Text>
              </View>
            </>
          )}
        </View>

        {/* Connections strip */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Connections</Text>
            <TouchableOpacity
              style={pendingCount > 0 ? styles.pendingNudge : undefined}
              onPress={() => router.push(Routes.profileConnections)}
            >
              {pendingCount > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={styles.pendingDot} />
                  <Text style={styles.pendingNudgeText}>
                    {pendingCount} pending →
                  </Text>
                </View>
              ) : (
                <Text style={styles.sectionLink}>Manage →</Text>
              )}
            </TouchableOpacity>
          </View>
          {loading ? (
            // Skeleton connection avatars
            <View style={styles.avatarStrip}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.connAvatar, i > 0 && { marginLeft: -6 }]}>
                  <View style={[styles.connAvatarCircle, { backgroundColor: '#E8E0D5' }]} />
                </View>
              ))}
            </View>
          ) : connections.length === 0 ? (
            <TouchableOpacity onPress={() => router.push(Routes.findFriends)}>
              <Text style={styles.emptyLink}>Find your first connection →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.avatarStrip}>
              {connections.map((conn, i) => (
                <TouchableOpacity
                  key={conn.id}
                  style={[styles.connAvatar, i > 0 && { marginLeft: -6 }]}
                  onPress={() => router.push(Routes.profileConnections)}
                  activeOpacity={0.75}
                >
                  <Avatar
                    name={conn.name}
                    userId={conn.id}
                    uri={(conn as any).image}
                    size="lg"
                    style={styles.connAvatarCircle}
                  />
                  <Text style={styles.connName}>{conn.name?.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
              {(stats?.connections ?? 0) > 4 && (
                <TouchableOpacity
                  style={[styles.connAvatar, { marginLeft: -6 }]}
                  onPress={() => router.push(Routes.profileConnections)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.connAvatarCircle, { backgroundColor: '#F0ECE8' }]}>
                    <Text style={styles.connMore}>+{(stats?.connections ?? 0) - 4}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Circles pills */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your circles</Text>
            <TouchableOpacity onPress={() => router.push(Routes.profileCircles)}>
              <Text style={styles.sectionLink}>See all</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            // Skeleton circle pills
            <View style={styles.circlesPills}>
              {[80, 100, 70].map((w, i) => (
                <View key={i} style={{ width: w, height: 34, backgroundColor: '#E8E0D5', borderRadius: 12 }} />
              ))}
            </View>
          ) : circles.length === 0 ? (
            <TouchableOpacity onPress={() => router.push(Routes.profileCircles)}>
              <Text style={styles.emptyLink}>Join a circle →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.circlesPills}>
              {circles.map(ci => (
                <View key={ci.id} style={[styles.circlePill, { backgroundColor: C.surface, borderColor: ci.categoryColor }]}>
                  <CircleIcon
                    coverImage={ci.coverImage}
                    categoryEmoji={ci.categoryEmoji}
                    categoryColor={ci.categoryColor}
                    size={20}
                    borderRadius={6}
                  />
                  <Text style={styles.circlePillName}>{ci.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Settings block */}
        <View style={styles.settingsBlock}>
          <TouchableOpacity style={styles.settingsRow} onPress={() => router.push(Routes.profileEdit)}>
            <MaterialIcons name="edit" size={20} color={C.textSecondary} />
            <Text style={styles.settingsLabel}>Edit profile</Text>
            <MaterialIcons name="chevron-right" size={20} color={C.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsRow} onPress={() => router.push(Routes.profileSettings)}>
            <MaterialIcons name="tune" size={20} color={C.textSecondary} />
            <Text style={styles.settingsLabel}>Settings</Text>
            <MaterialIcons name="chevron-right" size={20} color={C.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.settingsRow, { borderBottomWidth: 0 }]} onPress={async () => { await authClient.signOut(); router.replace('/(auth)/welcome'); }}>
            <MaterialIcons name="logout" size={20} color={C.error} />
            <Text style={[styles.settingsLabel, { color: C.error }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <QrModal
        visible={showQR}
        onClose={() => setShowQR(false)}
        userId={user?.id ?? ''}
        inviteUrl={inviteLink?.url ?? null}
        displayName={displayName}
        username={username}
        userImage={user?.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.backgroundWarm },

  // ── Dark hero header ──
  header: {
    flexDirection: 'row',
    padding: 22,
    paddingBottom: 18,
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#1A1512',
    overflow: 'hidden',
  },
  // Ambient orange glow orb in top-right corner
  headerGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,107,53,0.1)',
  },
  nameBlock: { flex: 1 },
  name: {
    fontFamily: Fonts.heading,
    fontSize: 30,
    color: '#F2E8DC',
    letterSpacing: -1,
    lineHeight: 33,
    fontStyle: 'italic',
  },
  username: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: 'rgba(242,232,220,0.4)',
    marginTop: 5,
    letterSpacing: 0.1,
  },
  availPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginTop: 11,
    borderWidth: 1,
  },
  availDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  availText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
  },
  avatarBlock: { alignItems: 'center', gap: 8 },
  avatar: {
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#1A1512',
  },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  qrIcon: { fontSize: 13, color: 'rgba(242,232,220,0.7)' },
  qrLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 9,
    color: 'rgba(242,232,220,0.7)',
    letterSpacing: 0.4,
  },

  // ── Orange accent rule — between dark header and cream body ──
  rule: {
    width: 36,
    height: 2,
    backgroundColor: C.primary,
    borderRadius: 2,
    marginLeft: 22,
    marginTop: 15,
    marginBottom: 8,
  },
  bio: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textSecondary,
    paddingHorizontal: 22,
    marginBottom: 14,
    lineHeight: 21,
  },

  // ── Stats row ──
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
  },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statNum: {
    fontFamily: Fonts.heading,
    fontSize: 26,
    color: C.text,
    letterSpacing: -0.8,
    fontStyle: 'italic',
  },
  statLabel: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: C.textTertiary,
    marginTop: 3,
    letterSpacing: 0.2,
  },
  statDivider: {
    width: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },

  // ── Sections ──
  section: { paddingHorizontal: 22, marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 13,
  },
  sectionTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: C.text,
    letterSpacing: -0.1,
  },
  sectionLink: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.primary,
    opacity: 0.85,
  },
  emptyLink: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.primary,
  },

  // ── Pending request badge / nudge ──
  pendingBadge: {
    backgroundColor: C.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  pendingBadgeText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: '#fff',
    lineHeight: 14,
  },
  pendingNudge: {
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  pendingNudgeText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.primary,
  },
  pendingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.primary,
  },

  // ── Connection avatar strip ──
  avatarStrip: { flexDirection: 'row', alignItems: 'flex-end' },
  connAvatar: { alignItems: 'center', width: 56 },
  connAvatarCircle: {
    shadowColor: C.cardShadowColor,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  connName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: C.textTertiary,
    marginTop: 5,
  },
  connMore: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.textTertiary,
  },

  // ── Circle pills ──
  circlesPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  circlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 13,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  circlePillEmoji: { fontSize: 15 },
  circlePillName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: C.text,
  },

  // ── Settings block ──
  settingsBlock: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderColor: C.borderWarm,
    marginTop: 4,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderBottomWidth: 1,
    borderColor: C.borderWarm,
  },
  settingsLabel: {
    fontFamily: Fonts.body,
    fontSize: 14,
    flex: 1,
    color: C.text,
    letterSpacing: -0.1,
  },
});
