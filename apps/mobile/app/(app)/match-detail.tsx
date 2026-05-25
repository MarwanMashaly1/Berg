/**
 * [align-1] Match detail screen — shown when a conversational (non-motive-mappable)
 * prompt match notification is tapped.
 *
 * Shows: today's prompt question, both users' answers, and a soft CTA to plan something.
 * The CTA leads to motive creation but is a choice, not a forced redirect.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../constants/theme';
import { apiFetch } from '../../lib/api';
import { Avatar } from '../../components/ui/Avatar';

const C = Colors.light;

type MatchDetail = {
  id: string;
  promptId: string;
  optionKey: string;
  status: 'pending' | 'viewed' | 'acted' | 'dismissed' | 'expired';
  prompt: {
    question: string;
    options: Array<{ key: string; emoji: string; text: string }>;
  };
  myAnswer: { key: string; emoji: string; text: string } | null;
  theirAnswer: { key: string; emoji: string; text: string } | null;
  friend: { id: string; name: string | null; avatarUrl: string | null };
  expiresAt: string;
};

export default function MatchDetailScreen() {
  const insets = useSafeAreaInsets();
  const { promptId, optionKey } = useLocalSearchParams<{ promptId: string; optionKey?: string }>();
  const [matches, setMatches] = useState<MatchDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ matches: MatchDetail[] }>('/api/matches')
      .then((data) => {
        // Filter to the specific prompt+option if provided by the notification
        const filtered = promptId
          ? data.matches.filter((m) =>
              m.promptId === promptId && (!optionKey || m.optionKey === optionKey),
            )
          : data.matches;
        setMatches(filtered);
      })
      .catch(() => setError('Could not load match details.'))
      .finally(() => setLoading(false));
  }, [promptId, optionKey]);

  const match = matches[0] ?? null;

  function handlePlanSomething() {
    if (!match) return;
    router.push({
      pathname: '/(app)/(tabs)/motives/create',
      params: {
        prefillUsers: JSON.stringify([{ id: match.friend.id, name: match.friend.name, username: null }]),
        originPromptId: match.promptId,
      },
    } as any);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Nav */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backChevron}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>You agree</Text>
        <View style={styles.navRight} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : error || !match ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {error ?? 'This match has expired or been dismissed.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Prompt question */}
          <Text style={styles.promptQuestion}>{match.prompt.question}</Text>

          {/* Answer cards — side by side */}
          <View style={styles.answerRow}>
            <View style={[styles.answerCard, styles.answerCardMine]}>
              <Text style={styles.answerLabel}>YOU</Text>
              <Text style={styles.answerEmoji}>{match.myAnswer?.emoji ?? '•'}</Text>
              <Text style={styles.answerText}>{match.myAnswer?.text ?? match.optionKey}</Text>
            </View>
            <View style={[styles.answerCard, styles.answerCardTheirs]}>
              <Text style={styles.answerLabel}>{match.friend.name?.toUpperCase() ?? 'THEM'}</Text>
              <Text style={styles.answerEmoji}>{match.theirAnswer?.emoji ?? '•'}</Text>
              <Text style={styles.answerText}>{match.theirAnswer?.text ?? match.optionKey}</Text>
            </View>
          </View>

          {/* Friend info */}
          <View style={styles.friendRow}>
            <Avatar name={match.friend.name ?? undefined} userId={match.friend.id} size="md" />
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>{match.friend.name ?? 'A friend'}</Text>
              <Text style={styles.friendSub}>Picked the same answer as you</Text>
            </View>
          </View>

          {/* Soft CTA — planning is a choice, not a forced redirect */}
          <TouchableOpacity style={styles.planBtn} onPress={handlePlanSomething} activeOpacity={0.85}>
            <Text style={styles.planBtnText}>Want to plan something?</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dismissBtn} onPress={() => router.back()}>
            <Text style={styles.dismissText}>Maybe later</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  navBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  backChevron: { fontSize: 18, color: C.text, fontFamily: Fonts.body, lineHeight: 22 },
  navTitle: {
    flex: 1, textAlign: 'center',
    fontFamily: Fonts.bodySemiBold, fontSize: 15, color: C.text,
  },
  navRight: { width: 34 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontFamily: Fonts.body, fontSize: 14, color: C.textTertiary, textAlign: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  promptQuestion: {
    fontFamily: Fonts.heading,
    fontStyle: 'italic',
    fontSize: 24,
    color: C.text,
    marginBottom: 28,
    lineHeight: 32,
  },
  answerRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  answerCard: {
    flex: 1,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 6,
  },
  answerCardMine: { backgroundColor: C.surfaceAlt, borderWidth: 1.5, borderColor: C.border },
  answerCardTheirs: { backgroundColor: 'rgba(255,107,53,0.07)', borderWidth: 1.5, borderColor: C.primary },
  answerLabel: {
    fontFamily: Fonts.bodySemiBold, fontSize: 10,
    color: C.textTertiary, letterSpacing: 0.8,
  },
  answerEmoji: { fontSize: 28 },
  answerText: {
    fontFamily: Fonts.bodySemiBold, fontSize: 13,
    color: C.text, textAlign: 'center',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 28,
  },
  friendInfo: { flex: 1 },
  friendName: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.text },
  friendSub: { fontFamily: Fonts.body, fontSize: 12, color: C.textTertiary, marginTop: 2 },
  planBtn: {
    height: 52, borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  planBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: C.textInverse },
  dismissBtn: { alignItems: 'center', paddingVertical: 12 },
  dismissText: { fontFamily: Fonts.body, fontSize: 13, color: C.textTertiary },
});
