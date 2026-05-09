import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Colors, Fonts } from '../../../../constants/theme';
import { getChats, ChatListItem } from '../../../../lib/api';
import { supabase } from '../../../../lib/supabase';
import { authClient } from '../../../../lib/auth';
import { Avatar } from '../../../../components/ui/Avatar';
import { SkeletonChatRow } from '../../../../components/ui/Skeleton';

const C = Colors.light;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86_400_000)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ChatRow({ item, onPress }: { item: ChatListItem; onPress: () => void }) {
  const isGroup = item.type === 'group' || item.memberPreviews.length > 2;
  const hasUnread = item.unreadCount > 0;
  const displayName =
    item.name ??
    item.memberPreviews
      .map((m) => m.name?.split(' ')[0])
      .filter(Boolean)
      .join(', ') ??
    'Chat';
  const subtitle = item.lastMessage
    ? `${item.lastMessage.senderName?.split(' ')[0] ?? 'Someone'}: ${item.lastMessage.content}`
    : 'No messages yet';

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarWrap}>
        {isGroup ? (
          <View style={styles.groupAvatar}>
            <MaterialIcons name="group" size={22} color={C.primary} />
          </View>
        ) : (
          <Avatar
            name={item.memberPreviews[0]?.name ?? item.name}
            userId={item.memberPreviews[0]?.id ?? null}
            size="lg"
          />
        )}
        {hasUnread && <View style={styles.unreadDot} />}
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text
            style={[styles.chatName, hasUnread && styles.chatNameBold]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {item.lastMessage && (
            <Text style={styles.timeText}>{formatTime(item.lastMessage.createdAt)}</Text>
          )}
        </View>
        <Text
          style={[styles.preview, hasUnread && styles.previewBold]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
        {item.type === 'motive_thread' && (
          <View style={styles.motiveTag}>
            <MaterialIcons name="event" size={10} color={C.primary} />
            <Text style={styles.motiveTagText}>Motive</Text>
          </View>
        )}
      </View>

      {hasUnread && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {item.unreadCount > 9 ? '9+' : item.unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const myId = session?.user?.id;

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getChats();
      setChats(data.chats);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Reload whenever the screen comes back into focus (e.g. returning from a chat room)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    load();

    if (!myId) return;

    // Subscribe to any new message INSERT — refresh the list when one arrives
    // in any chat the user belongs to. We can't filter by membership here,
    // so we reload from API (which already filters to user's chats).
    const channel = supabase
      .channel(`chat-list:${myId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          // Re-fetch the list to get updated lastMessage + unreadCount
          load();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chats' },
        () => {
          // A new chat was created (e.g. motive confirmed) — refresh list
          load();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [myId, load]);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push('/(app)/(tabs)/chat/new-group' as any)}
        >
          <MaterialIcons name="edit" size={20} color={C.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View>
          {[0, 1, 2, 3].map(i => <SkeletonChatRow key={i} />)}
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.center}>
          {/* Geometric chat bubble placeholder */}
          <View style={styles.emptyBubbleOuter}>
            <View style={styles.emptyBubbleInner} />
          </View>
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptySub}>
            Confirm a motive to start a group chat, or create one below.
          </Text>
          <TouchableOpacity
            style={styles.newGroupBtn}
            onPress={() => router.push('/(app)/(tabs)/chat/new-group' as any)}
          >
            <Text style={styles.newGroupBtnText}>Start a group chat</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatRow
              item={item}
              onPress={() =>
                router.push({
                  pathname: '/(app)/(tabs)/chat/[id]',
                  params: { id: item.id, name: item.name ?? undefined },
                } as any)
              }
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12,
    backgroundColor: C.background,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title: { fontFamily: Fonts.heading, fontSize: 28, color: C.text, fontStyle: 'italic', letterSpacing: -0.3 },
  newBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  // Geometric chat bubble empty state
  emptyBubbleOuter: {
    width: 64, height: 56, borderRadius: 18,
    backgroundColor: C.primaryMuted, marginBottom: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyBubbleInner: {
    width: 36, height: 28, borderRadius: 10,
    backgroundColor: C.surface, borderWidth: 2, borderColor: C.primary,
  },
  emptyTitle: { fontFamily: Fonts.heading, fontSize: 20, color: C.text, marginBottom: 6 },
  emptySub: {
    fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary,
    textAlign: 'center', marginBottom: 20,
  },
  newGroupBtn: {
    backgroundColor: C.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24,
  },
  newGroupBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.textInverse },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    backgroundColor: C.surface,
  },
  avatarWrap: { position: 'relative' },
  groupAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute', top: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.primary, borderWidth: 2, borderColor: C.background,
  },
  rowBody: { flex: 1 },
  rowTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 3,
  },
  chatName: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: C.text, flex: 1, marginRight: 8 },
  chatNameBold: { fontFamily: Fonts.bodySemiBold },
  timeText: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary },
  preview: { fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary },
  previewBold: { fontFamily: Fonts.bodySemiBold, color: C.text },
  motiveTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: C.primaryMuted, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  motiveTagText: { fontFamily: Fonts.body, fontSize: 11, color: C.primary },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textInverse },
  sep: { height: 1, backgroundColor: C.borderWarm, marginLeft: 84 },
});
