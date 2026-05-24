import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../constants/theme';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { getDiscoveryPeople, triggerFofRecompute, requestConnection, PersonSuggestion } from '../../lib/api';

const C = Colors.light;

function PersonCard({ person }: { person: PersonSuggestion }) {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected]   = useState(false);

  async function handleConnect() {
    if (connecting || connected) return;
    setConnecting(true);
    try { await requestConnection(person.id); setConnected(true); }
    catch { /* ignore */ }
    finally { setConnecting(false); }
  }

  function handleViewProfile() {
    router.push({
      pathname: '/(app)/user/[id]',
      params: { id: person.id, name: person.name ?? '', avatarUrl: person.avatarUrl ?? '' },
    } as any);
  }

  return (
    <TouchableOpacity style={styles.card} onPress={handleViewProfile} activeOpacity={0.85}>
      <Avatar
        name={person.name}
        userId={person.id}
        uri={person.avatarUrl}
        size="md"
      />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{person.name ?? 'Someone'}</Text>
        {person.mutualFriendName ? (
          <Text style={styles.cardMeta} numberOfLines={1}>via {person.mutualFriendName}</Text>
        ) : null}
        {person.sharedVibeTags.length > 0 && (
          <Text style={styles.cardTags} numberOfLines={1}>
            {person.sharedVibeTags.slice(0, 2).map(t => `${t.emoji} ${t.label}`).join(' · ')}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={[
          styles.connectBtn,
          connected  && styles.connectBtnDone,
          connecting && { opacity: 0.55 },
        ]}
        onPress={handleConnect}
        disabled={connecting || connected}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={[styles.connectText, connected && styles.connectTextDone]}>
          {connected ? '✓' : connecting ? '…' : 'Connect'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function SkeletonRow() {
  return (
    <View style={[styles.card, { gap: 12 }]}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width={120} height={12} borderRadius={6} />
        <Skeleton width={80} height={10} borderRadius={5} />
      </View>
      <Skeleton width={60} height={32} borderRadius={10} />
    </View>
  );
}

export default function DiscoverPeopleScreen() {
  const insets = useSafeAreaInsets();
  const [people, setPeople]       = useState<PersonSuggestion[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { people: p, lastComputedAt } = await getDiscoveryPeople();
      setPeople(p);
      // Trigger background recompute if FOF data is stale (> 24h) or missing
      const stale = !lastComputedAt || Date.now() - new Date(lastComputedAt).getTime() > 86_400_000;
      if (stale) triggerFofRecompute().catch(() => {});
    } catch { /* keep existing */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={styles.chevron} />
        </TouchableOpacity>
        <Text style={styles.title}>People you might know</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={loading ? Array.from({ length: 8 }) : people}
        keyExtractor={(item, i) => (item as PersonSuggestion)?.id ?? String(i)}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
        renderItem={({ item }) =>
          loading
            ? <SkeletonRow />
            : <PersonCard person={item as PersonSuggestion} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No suggestions yet</Text>
              <Text style={styles.emptySub}>We haven&apos;t found any friends-of-friends you might know yet. Come back after you&apos;ve connected with more people.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.background,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
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
    fontSize: 17,
    color: C.text,
    fontStyle: 'italic',
    letterSpacing: -0.3,
  },

  // Person card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.borderWarm,
    backgroundColor: C.surface,
  },
  cardInfo: { flex: 1, gap: 2 },
  cardName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: C.text,
    letterSpacing: -0.1,
  },
  cardMeta: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.textTertiary,
  },
  cardTags: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    marginTop: 1,
  },

  // Connect
  connectBtn: {
    backgroundColor: C.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexShrink: 0,
  },
  connectBtnDone: {
    backgroundColor: 'rgba(45,106,79,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(45,106,79,0.25)',
  },
  connectText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.textInverse,
  },
  connectTextDone: { color: '#2D6A4F' },

  // Empty
  empty: {
    paddingTop: 60,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    color: C.text,
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
});
