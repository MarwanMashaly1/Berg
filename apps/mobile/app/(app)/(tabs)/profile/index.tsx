import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, Share, RefreshControl, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { authClient } from '../../../../lib/auth';
import { Colors, Fonts } from '../../../../constants/theme';
import { Avatar } from '../../../../components/ui/Avatar';
import {
  getProfileStats, getProfileConnections, getProfileCircles, getInviteLink,
  patchUser, requestConnection, getPublicUser,
  ProfileStats, ProfileConnection, ProfileCircle, InviteLink,
} from '../../../../lib/api';

const C = Colors.light;
const AVAIL_OPTIONS = [
  { value: 'down_to_hang', emoji: '🟢', label: 'Down to hang', color: '#2D6A4F', bg: 'rgba(45,106,79,0.12)' },
  { value: 'ask_me',       emoji: '🟡', label: 'Ask me',       color: '#B7791F', bg: 'rgba(183,121,31,0.12)' },
  { value: 'busy',         emoji: '🔴', label: 'Busy',         color: '#C53030', bg: 'rgba(197,48,48,0.10)' },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const user = session?.user as any;

  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [connections, setConnections] = useState<ProfileConnection[]>([]);
  const [circles, setCircles] = useState<ProfileCircle[]>([]);
  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrTab, setQrTab] = useState<'my' | 'scan'>('my');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanResult, setScanResult] = useState<{ userId: string; name: string | null; image: string | null } | null>(null);
  const [scanSending, setScanSending] = useState(false);
  const scanCooldown = useRef(false);
  const [showAvailPicker, setShowAvailPicker] = useState(false);
  const [availability, setAvailability] = useState<string>(user?.availabilityStatus ?? 'down_to_hang');

  const loadAll = useCallback(async () => {
    const [s, c, ci, il] = await Promise.allSettled([
      getProfileStats(), getProfileConnections(), getProfileCircles(), getInviteLink(),
    ]);
    if (s.status === 'fulfilled') setStats(s.value);
    if (c.status === 'fulfilled') setConnections(c.value.confirmed.slice(0, 4));
    if (ci.status === 'fulfilled') setCircles(ci.value.joined.slice(0, 3));
    if (il.status === 'fulfilled') setInviteLink(il.value);
    setLoading(false);
  }, []);

  // Wait for session before loading — avoids 401 on first render before cookie is readable
  useEffect(() => { if (session) loadAll(); }, [session, loadAll]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function handleAvailability(value: string) {
    setAvailability(value);
    setShowAvailPicker(false);
    await patchUser({ availabilityStatus: value });
  }

  async function handleQRScan({ data }: BarcodeScanningResult) {
    if (scanCooldown.current || scanResult) return;
    // Parse berg://connect/{userId}
    const match = data.match(/^berg:\/\/connect\/([a-z0-9_-]+)$/i);
    if (!match) return;
    const scannedUserId = match[1];
    if (scannedUserId === user?.id) return; // can't connect with yourself
    scanCooldown.current = true;
    try {
      const { user: scannedUser } = await getPublicUser(scannedUserId);
      setScanResult({ userId: scannedUserId, name: scannedUser.name, image: scannedUser.image });
    } catch {
      scanCooldown.current = false;
    }
  }

  async function handleSendRequest() {
    if (!scanResult) return;
    setScanSending(true);
    try {
      await requestConnection(scanResult.userId);
      Alert.alert(
        'Request sent!',
        `Connection request sent to ${scanResult.name ?? 'this person'}.`,
        [{ text: 'Done', onPress: () => { setScanResult(null); setShowQR(false); scanCooldown.current = false; } }],
      );
    } catch (e: any) {
      Alert.alert('Already connected', e.message ?? 'Could not send request.');
      setScanResult(null);
      scanCooldown.current = false;
    } finally {
      setScanSending(false);
    }
  }

  const currentAvail = AVAIL_OPTIONS.find(o => o.value === availability) ?? AVAIL_OPTIONS[0];
  const displayName = user?.displayName ?? user?.name ?? 'Your Name';
  const username = user?.username;
  const bio = user?.bio;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
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
              <View style={styles.availPicker}>
                {AVAIL_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.availPickerOption, availability === opt.value && { backgroundColor: opt.bg, borderColor: opt.color }]}
                    onPress={() => handleAvailability(opt.value)}
                  >
                    <Text style={styles.availPickerEmoji}>{opt.emoji}</Text>
                    <Text style={[styles.availPickerLabel, availability === opt.value && { color: opt.color }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
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
              <TouchableOpacity style={styles.statCell} onPress={() => router.push('/(app)/(tabs)/profile/connections' as any)}>
                <Text style={styles.statNum}>{stats?.connections ?? '0'}</Text>
                <Text style={styles.statLabel}>Connections</Text>
              </TouchableOpacity>
              <View style={styles.statDivider} />
              <TouchableOpacity style={styles.statCell} onPress={() => router.push('/(app)/(tabs)/profile/circles' as any)}>
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
            <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profile/connections' as any)}>
              <Text style={styles.sectionLink}>Manage →</Text>
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
            <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profile/connections' as any)}>
              <Text style={styles.emptyLink}>Add your first connection →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.avatarStrip}>
              {connections.map((conn, i) => (
                <View key={conn.id} style={[styles.connAvatar, i > 0 && { marginLeft: -6 }]}>
                  <Avatar
                    name={conn.name}
                    userId={conn.id}
                    uri={(conn as any).image}
                    size="lg"
                    style={styles.connAvatarCircle}
                  />
                  <Text style={styles.connName}>{conn.name?.split(' ')[0]}</Text>
                </View>
              ))}
              {(stats?.connections ?? 0) > 4 && (
                <View style={[styles.connAvatar, { marginLeft: -6 }]}>
                  <View style={[styles.connAvatarCircle, { backgroundColor: '#F0ECE8' }]}>
                    <Text style={styles.connMore}>+{(stats?.connections ?? 0) - 4}</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Circles pills */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your circles</Text>
            <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profile/circles' as any)}>
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
            <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/profile/circles' as any)}>
              <Text style={styles.emptyLink}>Join a circle →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.circlesPills}>
              {circles.map(ci => (
                <View key={ci.id} style={[styles.circlePill, { backgroundColor: ci.categoryColor + '28', borderColor: ci.categoryColor + 'BB' }]}>
                  <Text style={styles.circlePillEmoji}>{ci.categoryEmoji}</Text>
                  <Text style={[styles.circlePillName, { color: ci.categoryColor }]}>{ci.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Settings block */}
        <View style={styles.settingsBlock}>
          <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/(app)/(tabs)/profile/edit' as any)}>
            <MaterialIcons name="edit" size={20} color={C.textSecondary} />
            <Text style={styles.settingsLabel}>Edit profile</Text>
            <MaterialIcons name="chevron-right" size={20} color={C.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/(app)/(tabs)/profile/settings' as any)}>
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

      {/* QR / Scan Modal */}
      <Modal
        visible={showQR}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => { setShowQR(false); setScanResult(null); scanCooldown.current = false; setQrTab('my'); }}
      >
        <View style={styles.qrModal}>
          {/* Header */}
          <View style={styles.qrModalHeader}>
            <TouchableOpacity
              style={styles.qrModalBack}
              onPress={() => { setShowQR(false); setScanResult(null); scanCooldown.current = false; setQrTab('my'); }}
            >
              <Text style={styles.qrModalBackText}>Close</Text>
            </TouchableOpacity>
            {/* Tab toggle */}
            <View style={styles.qrTabBar}>
              <TouchableOpacity
                style={[styles.qrTab, qrTab === 'my' && styles.qrTabActive]}
                onPress={() => setQrTab('my')}
              >
                <Text style={[styles.qrTabText, qrTab === 'my' && styles.qrTabTextActive]}>My Code</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.qrTab, qrTab === 'scan' && styles.qrTabActive]}
                onPress={async () => {
                  if (!cameraPermission?.granted) await requestCameraPermission();
                  setScanResult(null);
                  scanCooldown.current = false;
                  setQrTab('scan');
                }}
              >
                <Text style={[styles.qrTabText, qrTab === 'scan' && styles.qrTabTextActive]}>Scan</Text>
              </TouchableOpacity>
            </View>
            <View style={{ width: 52 }} />
          </View>

          {/* My Code tab */}
          {qrTab === 'my' && (
            <View style={styles.qrContent}>
              <Avatar name={displayName} userId={user?.id} size="xl" style={styles.qrAvatar} />
              <Text style={styles.qrName}>{displayName}</Text>
              {username ? <Text style={styles.qrUsername}>@{username}</Text> : null}
              {user?.id ? (
                <>
                  <View style={styles.qrBox}>
                    {/* QR value = berg://connect/{userId} — unique per user */}
                    <QRCode
                      value={`berg://connect/${user.id}`}
                      size={160}
                      color="#1a1a1a"
                      backgroundColor="#fff"
                    />
                  </View>
                  <Text style={styles.qrHint}>
                    Ask friends to scan this to connect with you
                  </Text>
                  {inviteLink && (
                    <TouchableOpacity
                      style={styles.qrShareBtn}
                      onPress={() => Share.share({ message: `Add me on Berg!\n${inviteLink.url}` })}
                    >
                      <Text style={styles.qrShareText}>Share invite link</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: Fonts.body }}>Loading…</Text>
              )}
            </View>
          )}

          {/* Scan tab */}
          {qrTab === 'scan' && (
            <View style={{ flex: 1 }}>
              {cameraPermission?.granted ? (
                scanResult ? (
                  // Show confirmation after successful scan
                  <View style={styles.scanConfirm}>
                    <Avatar name={scanResult.name} userId={scanResult.userId} size="xl" style={{ marginBottom: 16 }} />
                    <Text style={styles.scanConfirmName}>{scanResult.name ?? 'Someone'}</Text>
                    <Text style={styles.scanConfirmSub}>Send them a connection request?</Text>
                    <TouchableOpacity
                      style={[styles.qrShareBtn, { marginTop: 24 }]}
                      onPress={handleSendRequest}
                      disabled={scanSending}
                    >
                      <Text style={styles.qrShareText}>
                        {scanSending ? 'Sending…' : 'Send connection request'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.scanRetry}
                      onPress={() => { setScanResult(null); scanCooldown.current = false; }}
                    >
                      <Text style={styles.scanRetryText}>Scan again</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  // Camera viewfinder
                  <View style={{ flex: 1 }}>
                    <CameraView
                      style={{ flex: 1 }}
                      facing="back"
                      onBarcodeScanned={handleQRScan}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    />
                    <View style={styles.scanOverlay}>
                      <View style={styles.scanFrame} />
                      <Text style={styles.scanHint}>Point at an Berg QR code</Text>
                    </View>
                  </View>
                )
              ) : (
                <View style={styles.scanConfirm}>
                  <Text style={styles.scanConfirmName}>Camera access needed</Text>
                  <Text style={styles.scanConfirmSub}>Allow camera access to scan QR codes</Text>
                  <TouchableOpacity style={[styles.qrShareBtn, { marginTop: 20 }]} onPress={requestCameraPermission}>
                    <Text style={styles.qrShareText}>Allow camera</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>
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
  availPicker: { marginTop: 10, flexDirection: 'row', gap: 6 },
  availPickerOption: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  availPickerEmoji: { fontSize: 16 },
  availPickerLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: 'rgba(242,232,220,0.5)',
    textAlign: 'center',
  },
  avatarBlock: { alignItems: 'center', gap: 8 },
  avatar: {
    shadowColor: '#FF6B35',
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
    borderWidth: 1,
  },
  circlePillEmoji: { fontSize: 15 },
  circlePillName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
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

  // ── QR modal (stays dark) ──
  qrModal: { flex: 1, backgroundColor: '#111111' },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  qrModalBack: {},
  qrModalBackText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    width: 52,
  },
  // Tab toggle — dark-mode styling
  qrTabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 3,
  },
  qrTab: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  qrTabActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  qrTabText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  qrTabTextActive: { color: '#fff' },
  // My code content
  qrContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 60,
  },
  qrAvatar: { marginBottom: 16 },
  qrName: {
    fontFamily: Fonts.heading,
    fontSize: 26,
    color: '#fff',
    marginBottom: 4,
    letterSpacing: -0.5,
    fontStyle: 'italic',
  },
  qrUsername: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 24,
  },
  qrBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  qrHint: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 19,
  },
  qrShareBtn: {
    backgroundColor: C.primary,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 36,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  qrShareText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: '#fff',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  // Scan tab
  scanOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 220,
    height: 220,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: C.primary,
    shadowColor: C.primary,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 4,
  },
  scanHint: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  scanConfirm: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  scanConfirmName: {
    fontFamily: Fonts.heading,
    fontSize: 24,
    color: '#fff',
    fontStyle: 'italic',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  scanConfirmSub: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  scanRetry: { marginTop: 16, padding: 12 },
  scanRetryText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
});
