import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Share, RefreshControl, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../../../constants/theme';
import { Avatar } from '../../../../components/ui/Avatar';
import {
  getProfileConnections, getInviteLink,
  acceptConnection, declineConnection, cancelConnection,
  ProfileConnection, PendingConnection, SentConnection, InviteLink,
} from '../../../../lib/api';

const C = Colors.light;

// Availability label map
const AVAIL_LABEL: Record<string, { label: string; color: string }> = {
  down_to_hang: { label: 'Down to hang', color: '#2D6A4F' },
  ask_me:       { label: 'Ask me',       color: '#B7791F' },
  busy:         { label: 'Busy',         color: '#C53030' },
};

export default function ConnectionsScreen() {
  const insets = useSafeAreaInsets();

  const [confirmed, setConfirmed]   = useState<ProfileConnection[]>([]);
  const [pending, setPending]       = useState<PendingConnection[]>([]);
  const [sent, setSent]             = useState<SentConnection[]>([]);
  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
  const [query, setQuery]           = useState('');
  const [sentExpanded, setSentExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning]   = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [c, il] = await Promise.allSettled([getProfileConnections(), getInviteLink()]);
    if (c.status === 'fulfilled') {
      setConfirmed(c.value.confirmed);
      setPending(c.value.pending);
      setSent(c.value.sent ?? []);
    }
    if (il.status === 'fulfilled') setInviteLink(il.value);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleAccept(userId: string) {
    setActioning(userId);
    try {
      await acceptConnection(userId);
      await loadData(); // reload to move from pending → confirmed
    } catch { /* ignore */ }
    setActioning(null);
  }

  async function handleDecline(userId: string) {
    setActioning(userId);
    await declineConnection(userId);
    setPending((prev) => prev.filter((p) => p.id !== userId));
    setActioning(null);
  }

  async function handleCancel(userId: string, name: string | null) {
    Alert.alert(
      'Cancel request',
      `Cancel your connection request to ${name ?? 'this person'}?`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: async () => {
            setActioning(userId);
            await cancelConnection(userId);
            setSent((prev) => prev.filter((s) => s.id !== userId));
            setActioning(null);
          },
        },
      ],
    );
  }

  const filteredConfirmed = query.trim()
    ? confirmed.filter((c) => c.name?.toLowerCase().includes(query.toLowerCase()))
    : confirmed;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={styles.chevron} />
        </TouchableOpacity>
        <Text style={styles.title}>Connections</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/find-friends' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.findBtn}>Find friends</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
      >
        {/* Search bar */}
        <View style={styles.searchWrap}>
          <View style={styles.searchIcon}>
            <View style={styles.searchCircle} />
            <View style={styles.searchHandle} />
          </View>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search connections"
            placeholderTextColor={C.textTertiary}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Invite strip */}
        {inviteLink && (
          <TouchableOpacity
            style={styles.inviteStrip}
            onPress={() => Share.share({ message: `Join me on Berg!\n${inviteLink.url}` })}
            activeOpacity={0.85}
          >
            <View style={styles.inviteIcon}>
              <View style={styles.inviteLink1} />
              <View style={styles.inviteLink2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteTitle}>Invite friends</Text>
              <Text style={styles.inviteSub}>Share your link · {inviteLink.code}</Text>
            </View>
            <View style={styles.inviteBtn}>
              <Text style={styles.inviteBtnText}>Share</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Incoming requests ─────────────────────────────────────────── */}
        {pending.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>REQUESTS</Text>
              <View style={styles.badgePill}>
                <Text style={styles.badgeText}>{pending.length}</Text>
              </View>
            </View>
            {pending.map((p) => (
              <View key={p.id} style={styles.pendingCard}>
                <Avatar name={p.name} userId={p.id} size="md" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{p.name ?? 'Someone'}</Text>
                  <Text style={styles.rowMeta}>Wants to connect with you</Text>
                </View>
                <TouchableOpacity
                  style={[styles.acceptBtn, actioning === p.id && styles.btnDisabled]}
                  onPress={() => handleAccept(p.id)}
                  disabled={actioning === p.id}
                >
                  <Text style={styles.acceptText}>{actioning === p.id ? '…' : 'Accept'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDecline(p.id)}
                  disabled={actioning === p.id}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── Confirmed connections ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>CONNECTED</Text>
            <Text style={styles.sectionCount}>{filteredConfirmed.length}</Text>
          </View>

          {filteredConfirmed.length === 0 ? (
            <View style={styles.emptyState}>
              {/* Geometric people icon */}
              <View style={styles.emptyIconWrap}>
                <View style={styles.emptyHead} />
                <View style={styles.emptyBody} />
              </View>
              <Text style={styles.emptyTitle}>
                {query.trim() ? 'No results' : 'No connections yet'}
              </Text>
              <Text style={styles.emptySub}>
                {query.trim()
                  ? 'Try a different name'
                  : 'Invite friends or connect with people in Discovery'}
              </Text>
            </View>
          ) : (
            filteredConfirmed.map((conn) => {
              const avail = AVAIL_LABEL[conn.availabilityStatus] ?? AVAIL_LABEL.down_to_hang;
              return (
                <View key={conn.id} style={styles.connCard}>
                  <Avatar name={conn.name} userId={conn.id} size="md" />
                  <View style={{ flex: 1 }}>
                    <View style={styles.connNameRow}>
                      <Text style={styles.rowName}>{conn.name ?? 'Unknown'}</Text>
                      <View style={[styles.availDot, { backgroundColor: avail.color }]} />
                    </View>
                    {conn.sharedVibeTags.length > 0 ? (
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {conn.sharedVibeTags.map((t) => `${t.emoji} ${t.label}`).join(' · ')}
                      </Text>
                    ) : (
                      <Text style={styles.rowMeta}>{avail.label}</Text>
                    )}
                  </View>
                  {/* Chevron drawn with views */}
                  <View style={styles.rowChevron} />
                </View>
              );
            })
          )}
        </View>

        {/* ── Sent requests ─────────────────────────────────────────────── */}
        {sent.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeaderRow}
              onPress={() => setSentExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionLabel}>AWAITING REPLY</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.sectionCount}>{sent.length}</Text>
                <Text style={[styles.expandChev, sentExpanded && styles.expandChevOpen]}>›</Text>
              </View>
            </TouchableOpacity>

            {sentExpanded && sent.map((s) => (
              <View key={s.id} style={styles.sentCard}>
                <Avatar name={s.name} userId={s.id} size="md" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{s.name ?? 'Someone'}</Text>
                  <Text style={styles.rowMeta}>Request sent · waiting</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleCancel(s.id, s.name)}
                  disabled={actioning === s.id}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.cancelText}>
                    {actioning === s.id ? '…' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.backgroundWarm },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Left-pointing chevron drawn with a rotated view
  chevron: {
    width: 8,
    height: 8,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: C.textSecondary,
    transform: [{ rotate: '45deg' }],
    marginLeft: 3,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 22,
    color: C.text,
    letterSpacing: -0.5,
    fontStyle: 'italic',
    flex: 1,
  },
  findBtn: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: C.primary,
  },

  // ── Search ──
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.border,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  // Magnifying glass drawn with views
  searchIcon: { width: 15, height: 15, position: 'relative', flexShrink: 0 },
  searchCircle: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.textTertiary,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  searchHandle: {
    width: 5,
    height: 2,
    backgroundColor: C.textTertiary,
    borderRadius: 1,
    position: 'absolute',
    bottom: 0,
    right: 0,
    transform: [{ rotate: '-45deg' }],
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.text,
    padding: 0,
  },
  clearBtn: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textTertiary,
    paddingHorizontal: 4,
  },

  // ── Invite strip ──
  inviteStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 16,
    padding: 14,
    backgroundColor: C.primary,
  },
  // Two linked circles drawn with views
  inviteIcon: { width: 22, height: 14, flexShrink: 0, flexDirection: 'row', gap: -4 },
  inviteLink1: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  inviteLink2: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.8)',
    marginLeft: -6,
  },
  inviteTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.textInverse },
  inviteSub: { fontFamily: Fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  inviteBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  inviteBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: C.textInverse },

  // ── Sections ──
  section: { marginBottom: 10 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textTertiary,
    letterSpacing: 0.6,
    flex: 1,
  },
  sectionCount: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textTertiary,
  },
  badgePill: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: C.textInverse,
  },

  // ── Pending / incoming ──
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginHorizontal: 16,
    marginBottom: 7,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#F4A261',
    padding: 13,
  },
  acceptBtn: {
    backgroundColor: C.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnDisabled: { opacity: 0.5 },
  acceptText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.textInverse,
  },
  declineText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.textTertiary,
    paddingHorizontal: 6,
  },

  // ── Confirmed connection ──
  connCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginHorizontal: 16,
    marginBottom: 7,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 13,
    shadowColor: '#8B6A4A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  connNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 2,
  },
  availDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  // Right-pointing chevron for confirmed rows
  rowChevron: {
    width: 7,
    height: 7,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderColor: C.border,
    transform: [{ rotate: '45deg' }],
    flexShrink: 0,
  },

  // ── Sent / awaiting ──
  sentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginHorizontal: 16,
    marginBottom: 7,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
    padding: 13,
    opacity: 0.8,
  },
  cancelText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.error,
    paddingHorizontal: 6,
  },
  expandChev: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    color: C.textTertiary,
    transform: [{ rotate: '0deg' }],
  },
  expandChevOpen: {
    transform: [{ rotate: '90deg' }],
  },

  // ── Row typography ──
  rowName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.text,
    letterSpacing: -0.1,
  },
  rowMeta: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 2,
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyHead: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: C.textTertiary,
    marginBottom: 2,
  },
  emptyBody: {
    width: 20,
    height: 10,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 2.5,
    borderBottomWidth: 0,
    borderColor: C.textTertiary,
  },
  emptyTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.text,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
