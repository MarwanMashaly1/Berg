import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, Text, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, FlatList, Animated, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../../../constants/theme';
import {
  getTodayPrompt, getPromptMatches, getDiscoveryPeople,
  getDiscoveryCircles, getDiscoveryPulse, getNotifications,
  getUnreadCount, markAllRead, markNotificationRead,
  TodayPromptResponse, MatchResult, PersonSuggestion, CircleSuggestion,
  PulseCard, NotificationItem,
} from '../../../../lib/api';
import { PromptCard } from '../../../../components/features/discovery/PromptCard';
import { MatchReveal } from '../../../../components/features/discovery/MatchReveal';
import { PeopleSection } from '../../../../components/features/discovery/PeopleSection';
import { CirclesSection } from '../../../../components/features/discovery/CirclesSection';
import { CirclePulse } from '../../../../components/features/discovery/CirclePulse';

const C = Colors.light;

// ─── Notification inbox sheet ──────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type InboxSheetProps = {
  visible: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onTapItem: (item: NotificationItem) => void;
};

function InboxSheet({ visible, notifications, onClose, onMarkAllRead, onTapItem }: InboxSheetProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 22,
        stiffness: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim */}
      <TouchableOpacity
        style={styles.scrim}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.sheetHandle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Notifications</Text>
          {hasUnread && (
            <TouchableOpacity onPress={onMarkAllRead} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.markAllBtn}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {notifications.length === 0 ? (
          <View style={styles.emptyInbox}>
            <View style={styles.emptyIcon}>
              <View style={styles.emptyBell} />
            </View>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptySub}>Notifications will appear here</Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4 }}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => {
              const isUnread = !item.readAt;
              return (
                <TouchableOpacity
                  style={[styles.notifRow, isUnread && styles.notifRowUnread]}
                  onPress={() => onTapItem(item)}
                  activeOpacity={0.75}
                >
                  {/* Unread dot */}
                  <View style={styles.notifDotWrap}>
                    {isUnread && <View style={styles.unreadDot} />}
                  </View>
                  <View style={styles.notifContent}>
                    <View style={styles.notifTop}>
                      <Text style={[styles.notifTitle, isUnread && styles.notifTitleUnread]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.notifTime}>{relativeTime(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

// ─── Discovery screen ──────────────────────────────────────────────────────────

export default function DiscoveryScreen() {
  const insets = useSafeAreaInsets();

  const [promptData, setPromptData] = useState<TodayPromptResponse | null>(null);
  const [promptLoading, setPromptLoading] = useState(true);
  const [promptError, setPromptError] = useState(false);

  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [showReveal, setShowReveal] = useState(false);

  const [people, setPeople] = useState<PersonSuggestion[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);

  const [circles, setCircles] = useState<CircleSuggestion[]>([]);
  const [circlesLoading, setCirclesLoading] = useState(true);

  const [pulseCards, setPulseCards] = useState<PulseCard[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Notification state
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showInbox, setShowInbox] = useState(false);

  const loadAll = useCallback(async () => {
    const [p, pe, ci, pu, uc] = await Promise.allSettled([
      getTodayPrompt(),
      getDiscoveryPeople(),
      getDiscoveryCircles(),
      getDiscoveryPulse(),
      getUnreadCount(),
    ]);
    if (p.status === 'fulfilled') { setPromptData(p.value); setPromptError(false); }
    else setPromptError(true);
    setPromptLoading(false);
    if (pe.status === 'fulfilled') setPeople(pe.value.people);
    setPeopleLoading(false);
    if (ci.status === 'fulfilled') setCircles(ci.value.circles);
    setCirclesLoading(false);
    if (pu.status === 'fulfilled') setPulseCards(pu.value.cards);
    if (uc.status === 'fulfilled') setUnreadCount(uc.value.count);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function handleReveal() {
    if (!promptData?.prompt) return;
    try {
      const result = await getPromptMatches(promptData.prompt.id);
      setMatchResult(result);
      setShowReveal(true);
    } catch (e) {
      console.error('Match fetch failed:', e);
    }
  }

  function handleMakePlan(_userIds: string[]) {
    setShowReveal(false);
    router.push('/(app)/(tabs)/motives');
  }

  function handlePulseAction(card: PulseCard) {
    if (card.actionTarget.type === 'prompt_reveal') handleReveal();
  }

  // Open inbox — fetch fresh list
  async function handleOpenInbox() {
    setShowInbox(true);
    try {
      const result = await getNotifications();
      setNotifications(result.notifications);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  }

  async function handleMarkAllRead() {
    await markAllRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }

  async function handleTapNotification(item: NotificationItem) {
    // Mark as read
    if (!item.readAt) {
      markNotificationRead(item.id).catch(() => {});
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) =>
        prev.map((n) => n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)
      );
    }

    // Navigate to the right screen
    if (item.data) {
      try {
        const data = JSON.parse(item.data) as Record<string, string>;
        setShowInbox(false);
        setTimeout(() => {
          switch (data.screen) {
            case 'motives':
              if (data.motiveId) {
                const suffix = data.path ? `/${data.path}` : '';
                router.push(`/(app)/(tabs)/motives/${data.motiveId}${suffix}` as any);
              }
              break;
            case 'chat':
              if (data.chatId) router.push(`/(app)/(tabs)/chat/${data.chatId}` as any);
              break;
            case 'discovery':
              // Already here — just close the sheet
              break;
            case 'connections':
              router.push('/(app)/(tabs)/profile/connections' as any);
              break;
            case 'circle':
              if (data.circleId) {
                router.push({ pathname: '/(app)/(tabs)/profile/circle-detail', params: { id: data.circleId } } as any);
              }
              break;
          }
        }, 250); // brief delay so the sheet closes first
      } catch {}
    }
  }

  const selectedOption = promptData?.prompt.options.find(
    (o) => o.key === promptData.userResponse?.optionKey
  );

  const badgeCount = Math.min(unreadCount, 99);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discovery</Text>

        {/* Notification bell with badge */}
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={handleOpenInbox}
          activeOpacity={0.8}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          {/* Bell icon — drawn with views */}
          <View style={styles.bellIcon}>
            <View style={styles.bellTop} />
            <View style={styles.bellBody} />
            <View style={styles.bellBottom} />
          </View>

          {/* Unread badge */}
          {badgeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeCount > 9 ? '9+' : String(badgeCount)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.dateLabel}>
        {new Date().toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        }).toUpperCase()}
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }
      >
        <View style={styles.promptWrapper}>
          {promptLoading ? (
            <View style={styles.promptSkeleton}>
              <ActivityIndicator color="#FF6B35" />
            </View>
          ) : promptError ? (
            <View style={styles.promptError}>
              <Text style={styles.promptErrorText}>Couldn't load today's prompt. Pull to retry.</Text>
            </View>
          ) : promptData ? (
            <PromptCard
              prompt={promptData.prompt}
              userResponse={promptData.userResponse}
              onReveal={handleReveal}
            />
          ) : null}
        </View>

        <PeopleSection
          people={people}
          loading={peopleLoading}
          onAddToCircle={(userId) => console.log('Add to circle:', userId)}
        />

        <CirclesSection circles={circles} loading={circlesLoading} />

        {pulseCards.length > 0 && (
          <>
            <View style={styles.sectionDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>ACTIVITY</Text>
              <View style={styles.dividerLine} />
            </View>
            <CirclePulse cards={pulseCards} onAction={handlePulseAction} />
          </>
        )}
      </ScrollView>

      <MatchReveal
        visible={showReveal}
        result={matchResult}
        promptOption={selectedOption ? { emoji: selectedOption.emoji, text: selectedOption.text } : null}
        onDismiss={() => setShowReveal(false)}
        onMakePlan={handleMakePlan}
      />

      <InboxSheet
        visible={showInbox}
        notifications={notifications}
        onClose={() => setShowInbox(false)}
        onMarkAllRead={handleMarkAllRead}
        onTapItem={handleTapNotification}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },

  // ── Header ──
  header: {
    paddingHorizontal: 22,
    paddingTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 28,
    color: C.text,
    letterSpacing: -0.8,
    fontStyle: 'italic',
  },
  notifBtn: {
    width: 42,
    height: 42,
    backgroundColor: C.surface,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  // Bell icon drawn with views
  bellIcon: { alignItems: 'center', justifyContent: 'center', width: 18, height: 18 },
  bellTop: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.text,
    marginBottom: 1,
  },
  bellBody: {
    width: 14,
    height: 10,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.text,
    borderBottomWidth: 0,
  },
  bellBottom: {
    width: 14,
    height: 2,
    backgroundColor: C.text,
    borderRadius: 1,
    marginTop: -1,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: C.surface,
  },
  badgeText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 9,
    color: '#fff',
    lineHeight: 11,
  },

  dateLabel: {
    paddingHorizontal: 22,
    paddingTop: 6,
    fontSize: 11,
    color: '#C4A882',
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.8,
  },
  scroll: { flex: 1 },
  promptWrapper: {
    backgroundColor: '#181614',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 16,
  },
  promptSkeleton: {
    height: 240,
    backgroundColor: '#201510',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptError: { padding: 28, alignItems: 'center' },
  promptErrorText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    fontFamily: Fonts.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 28,
    marginBottom: 8,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: C.textTertiary,
    letterSpacing: 1.2,
  },

  // ── Inbox sheet ──
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    color: C.text,
    letterSpacing: -0.4,
    fontStyle: 'italic',
  },
  markAllBtn: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.primary,
  },

  // ── Notification rows ──
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    gap: 10,
  },
  notifRowUnread: {
    // Subtle warm tint on unread rows
  },
  notifDotWrap: {
    width: 8,
    paddingTop: 5,
    alignItems: 'center',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.primary,
  },
  notifContent: { flex: 1 },
  notifTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  notifTitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textSecondary,
    flex: 1,
  },
  notifTitleUnread: {
    fontFamily: Fonts.bodySemiBold,
    color: C.text,
  },
  notifBody: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
  },
  notifTime: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    flexShrink: 0,
  },
  separator: {
    height: 1,
    backgroundColor: C.borderWarm,
  },

  // ── Empty state ──
  emptyInbox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 52,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  // Simple geometric bell for empty state
  emptyBell: {
    width: 22,
    height: 18,
    borderRadius: 11,
    borderWidth: 2.5,
    borderColor: C.textTertiary,
    borderBottomWidth: 0,
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
  },
});
