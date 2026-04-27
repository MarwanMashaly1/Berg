import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Image, Alert, Share, Dimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Fonts } from '../../../../constants/theme';
import {
  getCircleDetail, joinCircle, approveMember, removeMember,
  getCircleMemories, CircleDetail, CircleMember, CirclePhoto,
} from '../../../../lib/api';
import { Avatar } from '../../../../components/ui/Avatar';
import { BackButton } from '../../../../components/ui/BackButton';

const { width: SCREEN_W } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_W - 28 - 8) / 3;

const C = Colors.light;

export default function CircleDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [circle, setCircle] = useState<CircleDetail | null>(null);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [pendingMembers, setPendingMembers] = useState<CircleMember[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CirclePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [data, memoriesData] = await Promise.allSettled([
        getCircleDetail(id),
        getCircleMemories(id),
      ]);
      if (data.status === 'fulfilled') {
        setCircle(data.value.circle);
        setMembers(data.value.members);
        setPendingMembers(data.value.pendingMembers);
        setMemberCount(data.value.memberCount);
        setIsAdmin(data.value.isAdmin);
        setMyStatus(data.value.myStatus);
      }
      if (memoriesData.status === 'fulfilled') setPhotos(memoriesData.value.photos);
    } catch (e) {
      console.error('Circle load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleJoin() {
    if (!circle) return;
    setJoining(true);
    try {
      const result = await joinCircle(circle.id);
      setMyStatus(result.status);
      setMemberCount(result.memberCount);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not join circle');
    } finally {
      setJoining(false);
    }
  }

  async function handleApprove(userId: string) {
    if (!circle) return;
    try {
      await approveMember(circle.id, userId);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not approve member');
    }
  }

  async function handleRemove(userId: string, name: string | null) {
    if (!circle) return;
    Alert.alert('Remove member', `Remove ${name ?? 'this member'} from the circle?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await removeMember(circle.id, userId);
            await load();
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Could not remove member');
          }
        },
      },
    ]);
  }

  async function handleShare() {
    if (!circle) return;
    await Share.share({
      message: `Join ${circle.name} on Berg! Use code: ${circle.joinCode}`,
    });
  }

  if (loading) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <BackButton variant="light" />
        </View>
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </View>
    );
  }

  if (!circle) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <BackButton variant="light" />
        </View>
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Circle not found.</Text>
        </View>
      </View>
    );
  }

  const canJoin = myStatus === null;
  const isPending = myStatus === 'pending';
  const isMember = myStatus === 'active';

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton variant="light" />
        {isAdmin && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(app)/(tabs)/profile/edit-circle', params: { id: circle.id } } as any)}
          >
            <Text style={styles.editBtn}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: circle.categoryColor }]}>
          <Text style={styles.heroEmoji}>{circle.categoryEmoji}</Text>
          <Text style={styles.heroName}>{circle.name}</Text>
          {circle.description ? <Text style={styles.heroDesc}>{circle.description}</Text> : null}
          <Text style={styles.heroMeta}>{memberCount} member{memberCount !== 1 ? 's' : ''}</Text>
        </View>

        {/* Join / Status bar */}
        {canJoin && (
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={[styles.joinBtn, joining && styles.joinBtnDisabled]}
              onPress={handleJoin}
              disabled={joining}
            >
              <Text style={styles.joinBtnText}>
                {joining ? '…' : (circle.requiresApproval ? 'Request to join' : 'Join circle')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {isPending && (
          <View style={styles.statusBar}>
            <Text style={styles.statusText}>Request pending — waiting for admin approval</Text>
          </View>
        )}

        {/* Share join code (admin or member) */}
        {(isMember || isAdmin) && circle.joinCode && (
          <TouchableOpacity style={styles.codeCard} onPress={handleShare}>
            <View>
              <Text style={styles.codeLabel}>JOIN CODE</Text>
              <Text style={styles.codeValue}>{circle.joinCode}</Text>
            </View>
            <Text style={styles.shareText}>Share</Text>
          </TouchableOpacity>
        )}

        {/* Memories grid */}
        {photos.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>MEMORIES · {photos.length}</Text>
            <View style={styles.photoGrid}>
              {photos.slice(0, 12).map((p, i) => (
                <Image key={i} source={{ uri: p.url }} style={styles.photoThumb} />
              ))}
            </View>
          </>
        )}

        {/* Pending approvals (admin only) */}
        {isAdmin && pendingMembers.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>PENDING REQUESTS · {pendingMembers.length}</Text>
            {pendingMembers.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <Avatar name={m.name} userId={m.id} size="md" uri={m.image ?? undefined} />
                <Text style={styles.memberName}>{m.name ?? 'Unknown'}</Text>
                <View style={styles.memberActions}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(m.id)}>
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRemove(m.id, m.name)}>
                    <MaterialIcons name="close" size={14} color={C.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Members */}
        <Text style={styles.sectionLabel}>MEMBERS · {memberCount}</Text>
        {members.map((m) => (
          <View key={m.id} style={styles.memberRow}>
            <Avatar name={m.name} userId={m.id} size="md" uri={m.image ?? undefined} />
            <Text style={styles.memberName}>{m.name ?? 'Unknown'}</Text>
            {isAdmin && m.id !== circle.adminUserId && (
              <TouchableOpacity onPress={() => handleRemove(m.id, m.name)}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingBottom: 8,
  },
  editBtn: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.primary },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: Fonts.body, fontSize: 13, color: C.textTertiary },
  hero: {
    marginHorizontal: 14, borderRadius: 20, padding: 24,
    alignItems: 'center', marginBottom: 16,
  },
  heroEmoji: { fontSize: 48, marginBottom: 8 },
  heroName: { fontFamily: Fonts.heading, fontSize: 22, color: C.text, textAlign: 'center', marginBottom: 4, fontStyle: 'italic' },
  heroDesc: { fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary, textAlign: 'center', marginBottom: 8, lineHeight: 19 },
  heroMeta: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary },
  actionBar: { paddingHorizontal: 14, marginBottom: 12 },
  joinBtn: { backgroundColor: C.primary, borderRadius: 14, padding: 14, alignItems: 'center' },
  joinBtnDisabled: { opacity: 0.5 },
  joinBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.textInverse },
  statusBar: {
    marginHorizontal: 14, backgroundColor: C.primaryMuted, borderRadius: 12,
    padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border,
  },
  statusText: { fontFamily: Fonts.body, fontSize: 12, color: C.textSecondary, textAlign: 'center' },
  codeCard: {
    marginHorizontal: 14, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1,
    borderColor: C.border, padding: 14, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  codeLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textTertiary, letterSpacing: 0.5, marginBottom: 2 },
  codeValue: { fontFamily: Fonts.bodySemiBold, fontSize: 22, color: C.text, letterSpacing: 4 },
  shareText: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: C.primary },
  sectionLabel: {
    fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textTertiary,
    letterSpacing: 0.5, paddingHorizontal: 18, marginBottom: 6, marginTop: 4,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.surface,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  memberName: { fontFamily: Fonts.body, fontSize: 13, color: C.text, flex: 1 },
  memberActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  approveBtn: { backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  approveBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textInverse },
  rejectBtn: {
    backgroundColor: C.surfaceAlt, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  removeText: { fontFamily: Fonts.body, fontSize: 11, color: C.error },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 4, marginBottom: 12 },
  photoThumb: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 8, backgroundColor: C.surfaceAlt },
});
