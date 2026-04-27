import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
  ScrollView, Alert, Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay,
} from 'react-native-reanimated';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Colors, Fonts } from '../../../../constants/theme';
import {
  getChatMessages, sendMessage, ChatMessage,
  renameGroupChat, getChatImageUploadUrl,
} from '../../../../lib/api';
import { supabase } from '../../../../lib/supabase';
import { authClient } from '../../../../lib/auth';
import { Avatar } from '../../../../components/ui/Avatar';
import { BackButton } from '../../../../components/ui/BackButton';

const C = Colors.light;
const TENOR_KEY = process.env.EXPO_PUBLIC_TENOR_API_KEY ?? '';

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

type ListItem =
  | { type: 'message'; data: ChatMessage }
  | { type: 'separator'; date: string; key: string };

function buildListItems(msgs: ChatMessage[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDay: string | null = null;
  for (const msg of msgs) {
    const day = new Date(msg.createdAt).toDateString();
    if (day !== lastDay) {
      items.push({ type: 'separator', date: msg.createdAt, key: `sep-${day}` });
      lastDay = day;
    }
    items.push({ type: 'message', data: msg });
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

// ── GIF search modal ──────────────────────────────────────────────────────────

type TenorGif = { id: string; url: string; preview: string };

function GifModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function search(q: string) {
    if (!TENOR_KEY) return;
    setLoading(true);
    try {
      const endpoint = q.trim()
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=24&media_filter=gif,tinygif`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=24&media_filter=gif,tinygif`;
      const res = await fetch(endpoint);
      const json = await res.json();
      const results: TenorGif[] = (json.results ?? []).map((r: any) => ({
        id: r.id,
        url: r.media_formats?.gif?.url ?? '',
        preview: r.media_formats?.tinygif?.url ?? r.media_formats?.gif?.url ?? '',
      }));
      setGifs(results.filter(g => g.url));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) search('');
  }, [visible]);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 400);
  }

  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[gm.sheet, { paddingBottom: insets.bottom }]}>
        <View style={gm.handle} />

        <View style={gm.searchRow}>
          <MaterialIcons name="search" size={18} color={C.textTertiary} style={{ marginLeft: 10 }} />
          <TextInput
            style={gm.input}
            value={query}
            onChangeText={handleQueryChange}
            placeholder="Search GIFs…"
            placeholderTextColor={C.textTertiary}
            autoFocus
          />
          <TouchableOpacity onPress={onClose} style={gm.closeBtn}>
            <MaterialIcons name="close" size={18} color={C.textTertiary} />
          </TouchableOpacity>
        </View>

        {!TENOR_KEY ? (
          <View style={gm.empty}>
            <Text style={gm.emptyTxt}>Add EXPO_PUBLIC_TENOR_API_KEY to .env to enable GIFs</Text>
          </View>
        ) : loading ? (
          <View style={gm.empty}><ActivityIndicator color={C.primary} /></View>
        ) : (
          <FlatList
            data={gifs}
            numColumns={2}
            keyExtractor={g => g.id}
            contentContainerStyle={{ padding: 8, gap: 6 }}
            columnWrapperStyle={{ gap: 6 }}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => { onPick(item.url); onClose(); }} style={gm.gifCell}>
                <Image source={{ uri: item.preview }} style={gm.gifImg} contentFit="cover" />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const gm = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '75%', backgroundColor: C.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, backgroundColor: C.surfaceAlt, borderRadius: 12,
  },
  input: {
    flex: 1, fontFamily: Fonts.body, fontSize: 14, color: C.text,
    paddingVertical: 10, paddingHorizontal: 8,
  },
  closeBtn: { padding: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTxt: { fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary, textAlign: 'center' },
  gifCell: { flex: 1, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: C.surfaceAlt },
  gifImg: { width: '100%', height: '100%' },
});

// ── Rename modal ──────────────────────────────────────────────────────────────

function RenameModal({
  visible,
  currentName,
  onClose,
  onSave,
}: {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(currentName);
  useEffect(() => { if (visible) setValue(currentName); }, [visible, currentName]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={rm.overlay}>
        <View style={rm.card}>
          <Text style={rm.title}>Rename group</Text>
          <TextInput
            style={rm.input}
            value={value}
            onChangeText={setValue}
            placeholder="Group name"
            placeholderTextColor={C.textTertiary}
            maxLength={60}
            autoFocus
            selectTextOnFocus
          />
          <View style={rm.row}>
            <TouchableOpacity onPress={onClose} style={rm.cancelBtn}>
              <Text style={rm.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => value.trim() && onSave(value.trim())}
              style={[rm.saveBtn, !value.trim() && rm.saveBtnDisabled]}
              disabled={!value.trim()}
            >
              <Text style={rm.saveTxt}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 20, width: '80%', gap: 16 },
  title: { fontFamily: Fonts.bodySemiBold, fontSize: 16, color: C.text, textAlign: 'center' },
  input: {
    fontFamily: Fonts.body, fontSize: 15, color: C.text,
    backgroundColor: C.surfaceAlt, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: C.border,
  },
  row: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: C.surfaceAlt },
  cancelTxt: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: C.primary },
  saveBtnDisabled: { backgroundColor: C.border },
  saveTxt: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.textInverse },
});

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe }: { msg: ChatMessage; isMe: boolean }) {
  const isImage = msg.type === 'image';
  const isGif = msg.type === 'gif';
  const isMedia = isImage || isGif;

  return (
    <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
      {!isMe && (
        <View style={styles.bubbleWithAvatar}>
          <Avatar
            name={msg.senderName}
            userId={msg.senderId}
            size="xs"
            style={{ marginRight: 6, alignSelf: 'flex-end' }}
          />
          <View style={styles.bubbleContent}>
            <Text style={styles.senderName}>{msg.senderName?.split(' ')[0] ?? 'Someone'}</Text>
            {isMedia ? (
              <View style={[styles.mediaBubble, styles.mediaBubbleThem]}>
                <Image
                  source={{ uri: msg.content }}
                  style={styles.mediaImg}
                  contentFit="cover"
                  transition={200}
                />
              </View>
            ) : (
              <View style={[styles.bubble, styles.bubbleThem]}>
                <Text style={[styles.bubbleText, styles.bubbleTextThem]}>
                  {msg.content}
                </Text>
              </View>
            )}
            <Text style={[styles.timeLabel, styles.timeLabelThem]}>
              {formatTime(msg.createdAt)}
            </Text>
          </View>
        </View>
      )}
      {isMe && (
        <>
          {isMedia ? (
            <View style={[styles.mediaBubble, styles.mediaBubbleMe]}>
              <Image
                source={{ uri: msg.content }}
                style={styles.mediaImg}
                contentFit="cover"
                transition={200}
              />
            </View>
          ) : (
            <View style={[styles.bubble, styles.bubbleMe]}>
              <Text style={[styles.bubbleText, styles.bubbleTextMe]}>
                {msg.content}
              </Text>
            </View>
          )}
          <Text style={[styles.timeLabel, styles.timeLabelMe]}>
            {formatTime(msg.createdAt)}
          </Text>
        </>
      )}
    </View>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function AnimatedDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: 400 }),
          withTiming(1, { duration: 400 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.typingDot, animStyle]} />;
}

function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const label = names.length === 1
    ? `${names[0]} is typing…`
    : `${names.slice(0, 2).join(', ')} are typing…`;
  return (
    <View style={styles.typingRow}>
      <View style={styles.typingDots}>
        <AnimatedDot delay={0} />
        <AnimatedDot delay={200} />
        <AnimatedDot delay={400} />
      </View>
      <Text style={styles.typingText}>{label}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

type PresenceState = Record<string, Array<{ userId: string; name: string; typing: boolean }>>;

export default function ChatRoomScreen() {
  const { id: chatId, name: initialName, type: chatType } = useLocalSearchParams<{
    id: string; name?: string; type?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const myId = session?.user?.id ?? '';
  const myName = session?.user?.name ?? 'Me';
  const isGroup = chatType === 'group';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
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
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [chatId]);

  // ── Realtime ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!chatId || !myId) return;
    loadHistory();

    const channel = supabase.channel(`chat:${chatId}`, {
      config: { presence: { key: myId } },
    });

    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => {
        const row = payload.new as {
          id: string; chat_id: string; sender_id: string;
          content: string; type: string; metadata: unknown; created_at: string;
        };
        const presenceState = channel.presenceState<{ userId: string; name: string }>() as unknown as PresenceState;
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
      const state = channel.presenceState<{ userId: string; name: string; typing: boolean }>() as PresenceState;
      const typers = Object.values(state).flat()
        .filter(p => p.userId !== myId && p.typing)
        .map(p => p.name?.split(' ')[0] ?? 'Someone');
      setTypingNames(typers);
    });

    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ userId: myId, name: myName, typing: false });
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
    if (!isTypingRef.current && val.length > 0) { isTypingRef.current = true; broadcastTyping(true); }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { isTypingRef.current = false; broadcastTyping(false); }, 2000);
  }

  // ── Send text ───────────────────────────────────────────────────────────────

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
      await sendMessage(chatId, trimmed);
    } catch { setText(trimmed); }
    finally { setSending(false); }
  }

  // ── Send GIF ────────────────────────────────────────────────────────────────

  async function handleSendGif(url: string) {
    if (!chatId) return;
    try {
      await sendMessage(chatId, url);
    } catch (e) {
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
      await sendMessage(chatId, publicUrl);
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

  const listItems = buildListItems(messages);

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
        ) : messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatTitle}>Start the conversation</Text>
            <Text style={styles.emptyChatGreeting}>Say hi!</Text>
            <Text style={styles.emptyChatSub}>Be the first to say something. No pressure — just vibe.</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={listItems}
            keyExtractor={item => item.type === 'message' ? item.data.id : item.key}
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
              return <MessageBubble msg={item.data} isMe={item.data.senderId === myId} />;
            }}
            contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12 }}
            showsVerticalScrollIndicator={false}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            ListFooterComponent={<TypingIndicator names={typingNames} />}
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
            <Text style={styles.gifLabel}>GIF</Text>
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
  container: { flex: 1, backgroundColor: '#F0E8DC' },
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

  bubbleWrap: { marginBottom: 6, maxWidth: '82%' },
  bubbleWrapMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleWrapThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubbleWithAvatar: { flexDirection: 'row', alignItems: 'flex-end' },
  bubbleContent: { flexDirection: 'column', alignItems: 'flex-start' },
  senderName: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textSecondary, marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
  bubbleMe: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' },
  bubbleText: { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  bubbleTextMe: { color: C.textInverse },
  bubbleTextThem: { color: C.text },
  mediaBubble: { borderRadius: 12, overflow: 'hidden' },
  mediaBubbleMe: { borderBottomRightRadius: 4 },
  mediaBubbleThem: { borderBottomLeftRadius: 4 },
  mediaImg: { width: 220, height: 180 },
  timeLabel: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary, marginTop: 2 },
  timeLabelMe: { textAlign: 'right', marginRight: 4 },
  timeLabelThem: { marginLeft: 4 },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingVertical: 6 },
  typingDots: { flexDirection: 'row', gap: 3 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
  typingText: { fontFamily: Fonts.body, fontSize: 11, color: C.textSecondary, fontStyle: 'italic' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 6,
    paddingHorizontal: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  gifLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textSecondary },
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
