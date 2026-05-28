import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Alert, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Colors, Fonts } from '../../../../constants/theme';
import {
  getChatMessages, sendMessage, ChatMessage,
  renameGroupChat, getChatImageUploadUrl,
} from '../../../../lib/api';
import { supabase } from '../../../../lib/supabase';
import { useCurrentUser } from '../../../../hooks/use-current-user';
import { log } from '../../../../lib/logger';
import { BackButton } from '../../../../components/ui/BackButton';
import { GifModal } from '../../../../components/chat/GifModal';
import { RenameModal } from '../../../../components/chat/RenameModal';
import { MessageBubble } from '../../../../components/chat/MessageBubble';
import { TypingIndicator } from '../../../../components/chat/TypingIndicator';

const C = Colors.light;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatDaySep(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

type OptimisticMsg = {
  localId: string;
  content: string;
  status: 'sending' | 'failed';
  createdAt: string;
};

type ListItem =
  | { type: 'message'; data: ChatMessage; showTime: boolean; showSenderName: boolean }
  | { type: 'separator'; date: string; key: string }
  | { type: 'optimistic'; data: OptimisticMsg };

function buildListItems(msgs: ChatMessage[], optimistic: OptimisticMsg[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDay: string | null = null;
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    const day = new Date(msg.createdAt).toDateString();
    if (day !== lastDay) {
      items.push({ type: 'separator', date: msg.createdAt, key: `sep-${day}` });
      lastDay = day;
    }
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const GAP = 60_000;
    const sameAsPrev = !!prev && prev.senderId === msg.senderId &&
      new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < GAP;
    const sameAsNext = !!next && next.senderId === msg.senderId &&
      new Date(next.createdAt).getTime() - new Date(msg.createdAt).getTime() < GAP;
    items.push({ type: 'message', data: msg, showSenderName: !sameAsPrev, showTime: !sameAsNext });
  }
  for (const msg of optimistic) {
    items.push({ type: 'optimistic', data: msg });
  }
  return items;
}

// ── Quick emoji panel ─────────────────────────────────────────────────────────

const QUICK_EMOJIS = [
  '😂','❤️','🔥','👀','😭','🙏','💀','✨','🥹','😍',
  '🤣','😅','👏','🎉','💯','🫶','😊','🤔','👋','😤',
  '🥲','💪','😎','🤝','🫠','👌','🙌','🤩','😩','💅',
];

function EmojiPanel({ onPick }: { onPick: (e: string) => void }) {
  return (
    <View style={ep.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ep.row}>
        {QUICK_EMOJIS.map(e => (
          <TouchableOpacity key={e} onPress={() => onPick(e)} style={ep.btn}>
            <Text style={ep.emoji}>{e}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const ep = StyleSheet.create({
  wrap: { backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, paddingVertical: 8 },
  row: { paddingHorizontal: 8, gap: 4 },
  btn: { padding: 6 },
  emoji: { fontSize: 26 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

type PresenceState = Record<string, Array<{ userId: string; name: string; typing: boolean }>>;

export default function ChatRoomScreen() {
  const { id: chatId, name: initialName, type: chatType } = useLocalSearchParams<{
    id: string; name?: string; type?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { user } = useCurrentUser();
  const myId = user?.id ?? '';
  const myName = user?.name ?? 'Me';
  const isGroup = chatType === 'group';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [optimistic, setOptimistic] = useState<OptimisticMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [groupName, setGroupName] = useState(initialName ?? 'Chat');

  // UI panels
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const listRef = useRef<FlatList<ListItem>>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // ── Load history ────────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    if (!chatId) return;
    try {
      const data = await getChatMessages(chatId);
      setMessages(data.messages);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (err) {
      log.error('chat load history failed', err);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }

  // When user returns to screen after a connection drop, reload history and
  // resubscribe presence so the channel is definitely live.
  useFocusEffect(useCallback(() => {
    loadHistory();
    if (channelRef.current) {
      const state = (channelRef.current as any).state as string | undefined;
      if (state === 'closed' || state === 'errored') {
        channelRef.current.subscribe();
      }
    }
    return () => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        channelRef.current?.track({ userId: myId, name: myName, typing: false });
      }
    };
  }, [loadHistory, myId, myName]));

  // ── Realtime ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!chatId || !myId) return;
    loadHistory();

    const channel = supabase.channel(`chat:${chatId}`, {
      config: { presence: { key: myId } },
    });

    // Broadcast listener — primary live-update path (no DB replication config needed)
    channel.on('broadcast', { event: 'new_message' }, ({ payload }) => {
      const msg = payload as ChatMessage;
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    });

    // postgres_changes — fallback if Supabase realtime publication includes messages table
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload: { new: Record<string, unknown> }) => {
        const row = payload.new as {
          id: string; chat_id: string; sender_id: string;
          content: string; type: string; metadata: unknown; created_at: string;
        };
        const presenceState = channel.presenceState() as unknown as PresenceState;
        const senderEntry = Object.values(presenceState).flat().find(p => p.userId === row.sender_id);
        const newMsg: ChatMessage = {
          id: row.id, chatId: row.chat_id, senderId: row.sender_id,
          senderName: senderEntry?.name ?? (row.sender_id === myId ? myName : null),
          senderImage: null, content: row.content, type: row.type,
          metadata: row.metadata as Record<string, unknown> | null,
          createdAt: row.created_at,
        };
        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      },
    );

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as unknown as PresenceState;
      const typers = Object.values(state).flat()
        .filter(p => p.userId !== myId && p.typing)
        .map(p => p.name?.split(' ')[0] ?? 'Someone');
      setTypingNames(typers);
    });

    let wasSubscribed = false;
    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ userId: myId, name: myName, typing: false });
        if (wasSubscribed) {
          // Channel reconnected after a drop — reload to catch missed messages
          loadHistory();
        }
        wasSubscribed = true;
      }
    });

    channelRef.current = channel;
    return () => { channel.untrack(); supabase.removeChannel(channel); channelRef.current = null; };
  }, [chatId, myId, myName, loadHistory]);

  // ── Typing ──────────────────────────────────────────────────────────────────

  function broadcastTyping(isTyping: boolean) {
    channelRef.current?.track({ userId: myId, name: myName, typing: isTyping });
  }

  function handleTextChange(val: string) {
    setText(val);
    if (val.length === 0) {
      if (isTypingRef.current) { isTypingRef.current = false; broadcastTyping(false); }
      if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
      return;
    }
    if (!isTypingRef.current) { isTypingRef.current = true; broadcastTyping(true); }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { isTypingRef.current = false; broadcastTyping(false); }, 2000);
  }

  // ── Send text ───────────────────────────────────────────────────────────────

  async function trySend(content: string, type: 'text' | 'image' | 'gif' = 'text', localId?: string) {
    if (!chatId) return;
    const id = localId ?? `local-${Date.now()}`;
    if (type === 'text') {
      setOptimistic(prev =>
        localId
          ? prev.map(m => m.localId === id ? { ...m, status: 'sending' } : m)
          : [...prev, { localId: id, content, status: 'sending', createdAt: new Date().toISOString() }],
      );
    }
    try {
      const { message } = await sendMessage(chatId, content, type);
      // Add real message immediately — don't depend on postgres_changes firing
      setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
      if (type === 'text') setOptimistic(prev => prev.filter(m => m.localId !== id));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      // Broadcast to other members so they get live updates without postgres_changes config
      channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: message });
    } catch (err) {
      log.error('chat send failed', err);
      if (type === 'text') {
        setOptimistic(prev => prev.map(m => m.localId === id ? { ...m, status: 'failed' } : m));
      }
    }
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || !chatId) return;
    setSending(true);
    setText('');
    setShowEmoji(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    isTypingRef.current = false;
    broadcastTyping(false);
    try {
      await trySend(trimmed);
    } finally { setSending(false); }
  }

  function handleRetry(msg: OptimisticMsg) {
    trySend(msg.content, 'text', msg.localId);
  }

  // ── Send GIF ────────────────────────────────────────────────────────────────

  async function handleSendGif(url: string) {
    if (!chatId) return;
    try {
      await trySend(url, 'gif');
    } catch {
      Alert.alert('Failed to send GIF');
    }
  }

  // ── Send image ──────────────────────────────────────────────────────────────

  async function handleSendImage() {
    if (!chatId || uploadingImage) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to share images.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';

    setUploadingImage(true);
    try {
      const { uploadUrl, publicUrl } = await getChatImageUploadUrl(chatId, mimeType, ext);

      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

      // Send the permanent public URL as an image message
      await trySend(publicUrl, 'image');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not send image.');
    } finally {
      setUploadingImage(false);
    }
  }

  // ── Rename group ────────────────────────────────────────────────────────────

  async function handleRename(name: string) {
    if (!chatId) return;
    setShowRename(false);
    try {
      await renameGroupChat(chatId, name);
      setGroupName(name);
    } catch { Alert.alert('Could not rename group'); }
  }

  // ── Emoji ───────────────────────────────────────────────────────────────────

  function handleEmojiPick(emoji: string) {
    setText(prev => prev + emoji);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const listItems = buildListItems(messages, optimistic);

  return (
    <>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <BackButton variant="light" />
          <TouchableOpacity
            style={styles.headerCenter}
            onPress={() => isGroup && setShowRename(true)}
            activeOpacity={isGroup ? 0.6 : 1}
          >
            <Text style={styles.headerName} numberOfLines={1}>{groupName}</Text>
            {isGroup && <Text style={styles.headerHint}>tap to rename</Text>}
            {typingNames.length > 0 && (
              <Text style={styles.headerTyping} numberOfLines={1}>
                {typingNames[0]} is typing…
              </Text>
            )}
          </TouchableOpacity>
          <View style={{ width: 36 }} />
        </View>

        {/* Messages */}
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={C.primary} /></View>
        ) : listItems.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatTitle}>Start the conversation</Text>
            <Text style={styles.emptyChatGreeting}>Say hi!</Text>
            <Text style={styles.emptyChatSub}>Be the first to say something. No pressure — just vibe.</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={listItems}
            keyExtractor={item =>
              item.type === 'message' ? item.data.id :
              item.type === 'optimistic' ? item.data.localId :
              item.key
            }
            renderItem={({ item }) => {
              if (item.type === 'separator') {
                return (
                  <View style={styles.daySep}>
                    <View style={styles.daySepLine} />
                    <Text style={styles.daySepText}>{formatDaySep(item.date)}</Text>
                    <View style={styles.daySepLine} />
                  </View>
                );
              }
              if (item.type === 'optimistic') {
                const failed = item.data.status === 'failed';
                return (
                  <TouchableOpacity
                    style={[styles.bubbleWrap, styles.bubbleWrapMe]}
                    onPress={() => failed && handleRetry(item.data)}
                    activeOpacity={failed ? 0.7 : 1}
                  >
                    <View style={[styles.bubble, styles.bubbleMe, failed && styles.bubbleFailed]}>
                      <Text style={[styles.bubbleText, styles.bubbleTextMe]}>{item.data.content}</Text>
                    </View>
                    <Text style={[styles.timeLabel, styles.timeLabelMe, failed && { color: C.error }]}>
                      {failed ? 'Failed · Tap to retry' : 'Sending…'}
                    </Text>
                  </TouchableOpacity>
                );
              }
              return (
                <MessageBubble
                  msg={item.data}
                  isMe={item.data.senderId === myId}
                  showTime={item.showTime}
                  showSenderName={item.showSenderName}
                />
              );
            }}
            contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12 }}
            showsVerticalScrollIndicator={false}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            ListFooterComponent={<TypingIndicator names={typingNames} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
            }
          />
        )}

        {/* Emoji panel */}
        {showEmoji && <EmojiPanel onPick={handleEmojiPick} />}

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          {/* Emoji / keyboard toggle */}
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setShowEmoji(s => !s)}
          >
            <MaterialIcons
              name={showEmoji ? 'keyboard' : 'emoji-emotions'}
              size={22}
              color={C.textSecondary}
            />
          </TouchableOpacity>

          {/* GIF */}
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowGif(true)}>
            <MaterialIcons name="gif" size={28} color={C.textSecondary} />
          </TouchableOpacity>

          {/* Image */}
          <TouchableOpacity style={styles.iconBtn} onPress={handleSendImage} disabled={uploadingImage}>
            {uploadingImage
              ? <ActivityIndicator size="small" color={C.primary} />
              : <MaterialIcons name="image" size={22} color={C.textSecondary} />
            }
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={handleTextChange}
            placeholder="Message…"
            placeholderTextColor={C.textTertiary}
            multiline
            maxLength={1000}
            returnKeyType="default"
            onFocus={() => setShowEmoji(false)}
          />

          {/* Send */}
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color={C.textInverse} />
              : <MaterialIcons name="send" size={18} color={C.textInverse} />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* GIF modal — outside KAV so it covers full screen */}
      <GifModal
        visible={showGif}
        onClose={() => setShowGif(false)}
        onPick={handleSendGif}
      />

      {/* Rename modal */}
      <RenameModal
        visible={showRename}
        currentName={groupName}
        onClose={() => setShowRename(false)}
        onSave={handleRename}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface, gap: 8,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerName: { fontFamily: Fonts.heading, fontSize: 16, color: C.text, fontStyle: 'italic' },
  headerHint: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary, marginTop: 1 },
  headerTyping: { fontFamily: Fonts.body, fontSize: 11, color: C.primary, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  daySep: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  daySepLine: { flex: 1, height: 1, backgroundColor: C.border },
  daySepText: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary, paddingHorizontal: 4 },

  // Optimistic bubble styles (real MessageBubble has its own stylesheet)
  bubbleWrap: { marginBottom: 6, maxWidth: '82%' },
  bubbleWrapMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
  bubbleMe: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleFailed: { backgroundColor: 'rgba(230,57,70,0.15)', borderWidth: 1, borderColor: 'rgba(230,57,70,0.4)' },
  bubbleText: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  bubbleTextMe: { color: C.textInverse },
  timeLabel: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary, marginTop: 2 },
  timeLabelMe: { textAlign: 'right', marginRight: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 4,
    paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface,
  },
  iconBtn: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1, fontFamily: Fonts.body, fontSize: 14, color: C.text,
    backgroundColor: '#F5EEE5', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: C.border },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 8 },
  emptyChatTitle: { fontFamily: Fonts.heading, fontSize: 20, color: C.text, textAlign: 'center' },
  emptyChatGreeting: { fontFamily: Fonts.heading, fontSize: 28, color: C.primary, textAlign: 'center' },
  emptyChatSub: { fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary, textAlign: 'center' },
});
