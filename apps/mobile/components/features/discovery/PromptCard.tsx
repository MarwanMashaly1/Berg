import { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { C, Fonts } from '../../../constants/theme';
import { PromptOption, TodayPromptResponse, respondToPrompt } from '../../../lib/api';

type Props = {
  prompt: TodayPromptResponse['prompt'];
  userResponse: TodayPromptResponse['userResponse'];
  onReveal: () => void;
  onAnswered?: (optionKey: string, optionIndex: number, storyText?: string) => void;
};

// ─── Shared bounce animation ───────────────────────────────────────────────────

function useBounce() {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  function bounce() {
    scale.value = withSequence(
      withTiming(0.93, { duration: 60 }),
      withSpring(1.03, { damping: 14, stiffness: 300 }),
      withSpring(1.0,  { damping: 18, stiffness: 220 }),
    );
  }
  return { animStyle, bounce };
}

// ─── pick_your_camp / have_you_ever option row ────────────────────────────────

function ListOption({
  option, selected, dimmed, onPress,
}: {
  option: PromptOption; selected: boolean; dimmed: boolean; onPress: () => void;
}) {
  const { animStyle, bounce } = useBounce();
  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.option, selected && styles.optionSelected, dimmed && styles.optionDimmed]}
        onPress={() => { bounce(); onPress(); }}
        activeOpacity={0.85}
      >
        <Text style={styles.optionEmoji}>{option.emoji}</Text>
        <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
          {option.text}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── this_or_that tile ────────────────────────────────────────────────────────

function TileOption({
  option, selected, dimmed, onPress,
}: {
  option: PromptOption; selected: boolean; dimmed: boolean; onPress: () => void;
}) {
  const { animStyle, bounce } = useBounce();
  return (
    <Animated.View style={[animStyle, { flex: 1 }]}>
      <TouchableOpacity
        style={[styles.totOption, selected && styles.optionSelected, dimmed && styles.optionDimmed]}
        onPress={() => { bounce(); onPress(); }}
        activeOpacity={0.85}
      >
        <Text style={styles.optionEmoji}>{option.emoji}</Text>
        <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
          {option.text}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── spectrum pole (left or right) ────────────────────────────────────────────

function SpectrumPole({
  option, selected, dimmed, onPress, side,
}: {
  option: PromptOption; selected: boolean; dimmed: boolean; onPress: () => void;
  side: 'left' | 'right';
}) {
  const { animStyle, bounce } = useBounce();
  return (
    <Animated.View style={[animStyle, { flex: 1 }]}>
      <TouchableOpacity
        style={[
          styles.poleOption,
          side === 'left' ? styles.poleLeft : styles.poleRight,
          selected && styles.poleSelected,
          dimmed && styles.optionDimmed,
        ]}
        onPress={() => { bounce(); onPress(); }}
        activeOpacity={0.85}
      >
        <Text style={styles.optionEmoji}>{option.emoji}</Text>
        <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
          {option.text}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main PromptCard ──────────────────────────────────────────────────────────

export function PromptCard({ prompt, userResponse, onReveal, onAnswered }: Props) {
  const [selectedKey, setSelectedKey]   = useState(userResponse?.optionKey ?? null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    userResponse?.optionIndex ?? null,
  );
  const [storyText, setStoryText]   = useState(userResponse?.storyText ?? '');
  const [submitting, setSubmitting] = useState(false);

  const cardScale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  const hasAnswered = !!userResponse;
  const isHaveYouEver = prompt.type === 'have_you_ever';
  const isSpectrum    = prompt.type === 'spectrum';
  const isThisOrThat  = prompt.type === 'this_or_that';

  function handleSelect(option: PromptOption) {
    setSelectedKey(option.key);
    setSelectedIndex(option.index);
  }

  async function handleReveal() {
    if (!selectedKey || selectedIndex === null) return;
    setSubmitting(true);
    cardScale.value = withSpring(0.97, { damping: 12 });
    try {
      await respondToPrompt(prompt.id, {
        optionKey: selectedKey,
        optionIndex: selectedIndex,
        storyText: storyText || undefined,
      });
      cardScale.value = withSpring(1.0, { damping: 10 });
      onAnswered?.(selectedKey, selectedIndex, storyText || undefined);
      onReveal();
    } catch (e) {
      console.error('Failed to respond:', e);
      cardScale.value = withSpring(1.0, { damping: 10 });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Compact answered state ────────────────────────────────────────────────

  if (hasAnswered) {
    const answeredOption = prompt.options.find((o) => o.key === userResponse.optionKey);
    return (
      <TouchableOpacity onPress={onReveal} activeOpacity={0.85} style={styles.cardInner}>
        <View style={styles.glow} />
        <View style={styles.glowBottom} />
        <Text style={styles.tag}>ANSWERED ✓</Text>
        <Text style={styles.questionCompact} numberOfLines={1}>{prompt.question}</Text>
        <Text style={styles.answerCompact}>
          {answeredOption?.emoji} {answeredOption?.text}
        </Text>
        {/* have_you_ever: show story snippet if written */}
        {isHaveYouEver && userResponse.storyText ? (
          <Text style={styles.storySnippet} numberOfLines={2}>
            "{userResponse.storyText}"
          </Text>
        ) : null}
        <Text style={styles.matchTeaserText}>See who agreed →</Text>
      </TouchableOpacity>
    );
  }

  // ── Unanswered state ──────────────────────────────────────────────────────

  return (
    <Animated.View style={cardStyle}>
      <View style={styles.cardInner}>
        <View style={styles.glow} />
        <View style={styles.glowBottom} />

        {/* Type tag */}
        <View style={styles.tagRow}>
          <View style={styles.tagDot} />
          <Text style={styles.tag}>DAILY PROMPT</Text>
        </View>

        <Text style={styles.question}>{prompt.question}</Text>

        {/* ── Type-specific option layouts ── */}

        {isSpectrum ? (
          // spectrum: two poles side-by-side with a vertical "or" divider
          <View style={styles.spectrumRow}>
            <SpectrumPole
              option={prompt.options[0]}
              selected={selectedKey === prompt.options[0].key}
              dimmed={!!(selectedKey && selectedKey !== prompt.options[0].key)}
              onPress={() => handleSelect(prompt.options[0])}
              side="left"
            />
            <View style={styles.spectrumDivider}>
              <View style={styles.spectrumDividerLine} />
              <Text style={styles.spectrumOrText}>or</Text>
              <View style={styles.spectrumDividerLine} />
            </View>
            <SpectrumPole
              option={prompt.options[1]}
              selected={selectedKey === prompt.options[1].key}
              dimmed={!!(selectedKey && selectedKey !== prompt.options[1].key)}
              onPress={() => handleSelect(prompt.options[1])}
              side="right"
            />
          </View>
        ) : (
          // All boxed types: pick_your_camp, this_or_that, have_you_ever
          <View style={styles.optionsContainer}>
            {isThisOrThat ? (
              <View style={styles.totRow}>
                {prompt.options.slice(0, 2).map((opt) => (
                  <TileOption
                    key={opt.key}
                    option={opt}
                    selected={selectedKey === opt.key}
                    dimmed={!!(selectedKey && selectedKey !== opt.key)}
                    onPress={() => handleSelect(opt)}
                  />
                ))}
              </View>
            ) : (
              prompt.options.map((opt) => (
                <ListOption
                  key={opt.key}
                  option={opt}
                  selected={selectedKey === opt.key}
                  dimmed={!!(selectedKey && selectedKey !== opt.key)}
                  onPress={() => handleSelect(opt)}
                />
              ))
            )}
          </View>
        )}

        {/* ── Story input ── */}
        {/* have_you_ever: always visible — the story is the point
            everything else: only after selecting */}
        {(selectedKey || isHaveYouEver) && (
          <View style={styles.storyContainer}>
            <Text style={styles.storyLabel}>
              {isHaveYouEver ? 'What happened? (optional)' : 'Add your story (optional)'}
            </Text>
            <TextInput
              style={styles.storyInput}
              value={storyText}
              onChangeText={setStoryText}
              placeholder={isHaveYouEver ? 'Share the story behind your answer…' : 'What happened?'}
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              maxLength={280}
            />
          </View>
        )}

        {/* ── CTA — always requires an option selected ── */}
        {selectedKey && (
          <TouchableOpacity
            style={[styles.cta, submitting && { opacity: 0.7 }]}
            onPress={handleReveal}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.ctaText}>See who agrees →</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardInner: {
    padding: 22,
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: -40, right: -40,
    width: 160, height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,107,53,0.14)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -30, left: -30,
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,140,80,0.07)',
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 13 },
  tagDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#FF6B35',
    shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 4, elevation: 2,
  },
  tag: {
    fontSize: 10, color: '#FF6B35',
    fontFamily: Fonts.bodySemiBold, letterSpacing: 1, opacity: 0.9,
  },
  question: {
    fontFamily: Fonts.heading, fontSize: 19, color: '#FFFFFF',
    lineHeight: 27, marginBottom: 18, letterSpacing: -0.3,
  },
  questionCompact: {
    fontFamily: Fonts.heading, fontSize: 13,
    color: 'rgba(255,255,255,0.6)', lineHeight: 19, marginBottom: 4,
  },
  answerCompact: {
    fontFamily: Fonts.headingRegular, fontSize: 15, color: '#fff', fontStyle: 'italic',
  },
  storySnippet: {
    fontFamily: Fonts.headingRegular, fontSize: 12,
    color: 'rgba(255,255,255,0.45)', fontStyle: 'italic',
    marginTop: 6, lineHeight: 18,
  },
  matchTeaserText: {
    fontSize: 12, color: '#FF8C5A',
    fontFamily: Fonts.bodySemiBold, marginTop: 10,
  },

  // ── Boxed options container (pick_your_camp, this_or_that, have_you_ever) ──
  optionsContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    padding: 8, gap: 5,
  },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingHorizontal: 14, paddingVertical: 13,
    borderRadius: 13, borderWidth: 1, borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: 'rgba(255,107,53,0.13)',
    borderColor: 'rgba(255,107,53,0.35)',
  },
  optionDimmed: { opacity: 0.35 },
  totRow: { flexDirection: 'row', gap: 10 },
  totOption: {
    alignItems: 'center', padding: 15, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.05)', gap: 8, flex: 1,
  },
  optionEmoji: { fontSize: 22, lineHeight: 26 },
  optionText: {
    fontSize: 13, color: 'rgba(255,255,255,0.88)',
    fontFamily: Fonts.bodySemiBold, textAlign: 'center', lineHeight: 18,
  },
  optionTextSelected: { color: '#FFB088' },

  // ── Spectrum: poles + "or" divider ────────────────────────────────────────
  spectrumRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 0,
  },
  poleOption: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: 8,
    minHeight: 88,
  },
  poleLeft: {
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  poleRight: {
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  poleSelected: {
    backgroundColor: 'rgba(255,107,53,0.15)',
    borderColor: 'rgba(255,107,53,0.4)',
  },
  spectrumDivider: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 18,
  },
  spectrumDividerLine: {
    flex: 1,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  spectrumOrText: {
    fontSize: 10,
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.28)',
    letterSpacing: 0.5,
  },

  // ── Story input ──────────────────────────────────────────────────────────
  storyContainer: { marginTop: 14 },
  storyLabel: {
    fontSize: 11, color: 'rgba(255,107,53,0.8)',
    fontFamily: Fonts.bodySemiBold, marginBottom: 7, letterSpacing: 0.2,
  },
  storyInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.35)',
    borderRadius: 14, padding: 13,
    fontSize: 13, color: '#fff',
    fontFamily: Fonts.headingRegular, fontStyle: 'italic',
    minHeight: 54,
  },

  // ── CTA ──────────────────────────────────────────────────────────────────
  cta: {
    marginTop: 14, borderRadius: 15, padding: 15,
    alignItems: 'center', overflow: 'hidden',
    shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 10,
    backgroundColor: '#FF6B35',
  },
  ctaText: {
    fontSize: 14, fontFamily: Fonts.bodySemiBold, color: '#fff', letterSpacing: 0.2,
  },
});
