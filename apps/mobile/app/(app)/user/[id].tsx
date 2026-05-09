import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../../constants/theme';
import { Avatar } from '../../../components/ui/Avatar';
import { getPublicUser, requestConnection } from '../../../lib/api';

const C = Colors.light;

const AVAIL_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  down_to_hang: { label: 'Down to hang', color: '#2D6A4F', bg: 'rgba(45,106,79,0.10)' },
  ask_me:       { label: 'Ask me',       color: '#B7791F', bg: 'rgba(183,121,31,0.10)' },
  busy:         { label: 'Busy',         color: '#C53030', bg: 'rgba(197,48,48,0.08)'  },
};

export default function PublicUserProfile() {
  const insets = useSafeAreaInsets();
  const { id, name: paramName, avatarUrl: paramAvatar } = useLocalSearchParams<{
    id: string;
    name?: string;
    avatarUrl?: string;
  }>();

  const [user, setUser] = useState<{
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
    availabilityStatus: string;
    vibeTags: Array<{ emoji: string; label: string }>;
    connectionStatus: 'pending' | 'confirmed' | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (paramName) {
      setUser({
        id,
        name: paramName,
        image: paramAvatar ?? null,
        username: null,
        availabilityStatus: 'down_to_hang',
        vibeTags: [],
        connectionStatus: null,
      });
    }
    getPublicUser(id)
      .then(({ user: u }) => {
        setUser({ ...u, vibeTags: u.vibeTags ?? [], connectionStatus: u.connectionStatus ?? null });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleConnect() {
    if (!id || connecting || requested) return;
    setConnecting(true);
    try {
      await requestConnection(id);
      setRequested(true);
    } catch { /* ignore */ }
    finally { setConnecting(false); }
  }

  const connectionStatus = requested ? 'pending' : user?.connectionStatus ?? null;
  const avail = AVAIL_LABEL[user?.availabilityStatus ?? ''] ?? AVAIL_LABEL.down_to_hang;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-back-ios" size={16} color="rgba(242,232,220,0.8)" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {/* Dark hero */}
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Avatar
            name={user?.name}
            userId={user?.id ?? id}
            uri={user?.image}
            size="xl"
            style={styles.avatar}
          />
          <Text style={styles.heroName}>{user?.name ?? paramName ?? 'Someone'}</Text>
          {user?.username ? (
            <Text style={styles.heroHandle}>@{user.username}</Text>
          ) : null}
          {user && (
            <View style={[styles.availPill, { backgroundColor: avail.bg }]}>
              <View style={[styles.availDot, { backgroundColor: avail.color }]} />
              <Text style={[styles.availText, { color: avail.color }]}>{avail.label}</Text>
            </View>
          )}
        </View>

        {/* Vibe tags */}
        {user && (user.vibeTags ?? []).length > 0 && (
          <View style={styles.tagsSection}>
            <Text style={styles.tagsLabel}>INTERESTS</Text>
            <View style={styles.tagsWrap}>
              {(user.vibeTags ?? []).map((t) => (
                <View key={t.label} style={styles.tag}>
                  <Text style={styles.tagText}>{t.emoji} {t.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Connect CTA */}
        <View style={styles.ctaSection}>
          {loading && !user ? (
            <ActivityIndicator color={C.primary} />
          ) : connectionStatus === 'confirmed' ? (
            <View style={[styles.connectBtn, styles.connectBtnDone]}>
              <Text style={[styles.connectText, styles.connectTextDone]}>Connected ✓</Text>
            </View>
          ) : connectionStatus === 'pending' ? (
            <View style={[styles.connectBtn, styles.connectBtnPending]}>
              <Text style={[styles.connectText, styles.connectTextPending]}>Request sent · waiting</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.connectBtn, connecting && { opacity: 0.6 }]}
              onPress={handleConnect}
              disabled={connecting}
              activeOpacity={0.85}
            >
              <Text style={styles.connectText}>
                {connecting ? 'Sending…' : 'Connect'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.backgroundWarm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 0,
    paddingTop: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Hero
  hero: {
    backgroundColor: '#1A1512',
    paddingTop: 20,
    paddingBottom: 36,
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute', top: -40, right: -40,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,107,53,0.10)',
  },
  avatar: {
    marginBottom: 8,
    borderWidth: 3,
    borderColor: '#1A1512',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  heroName: {
    fontFamily: Fonts.heading,
    fontSize: 28,
    color: '#F2E8DC',
    fontStyle: 'italic',
    letterSpacing: -0.6,
  },
  heroHandle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(242,232,220,0.40)',
  },
  availPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  availDot: { width: 7, height: 7, borderRadius: 3.5 },
  availText: { fontFamily: Fonts.bodySemiBold, fontSize: 12 },

  // CTA
  ctaSection: {
    padding: 24,
    paddingTop: 28,
  },
  connectBtn: {
    backgroundColor: C.text,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: C.cardShadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  connectBtnDone: {
    backgroundColor: 'rgba(45,106,79,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(45,106,79,0.30)',
  },
  connectBtnPending: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: C.border,
  },
  connectText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.textInverse,
  },
  connectTextDone: { color: C.success },
  connectTextPending: { color: C.textSecondary },

  // Vibe tags
  tagsSection: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tagsLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: C.textTertiary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  tagText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.text,
  },
});
