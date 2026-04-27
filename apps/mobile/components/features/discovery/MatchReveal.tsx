import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Switch, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withTiming, withSpring, withDelay, withSequence,
  Easing, runOnJS,
} from 'react-native-reanimated';
import { Fonts } from '../../../constants/theme';
import { MatchResult } from '../../../lib/api';

const { width: SW, height: SH } = Dimensions.get('window');

// ── Confetti particle ─────────────────────────────────────────────────────────
const COLORS = ['#FF6B35', '#FF8C5A', '#FFD5BB', '#FF4500', '#FFB347', '#FFA07A'];

function ConfettiParticle({ delay, angle, distance, color, size }: {
  delay: number; angle: number; distance: number; color: string; size: number;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const rad = (angle * Math.PI) / 180;
    const tx = Math.cos(rad) * distance;
    const ty = Math.sin(rad) * distance;

    opacity.value = withDelay(delay, withTiming(1, { duration: 100 }));
    scale.value  = withDelay(delay, withSpring(1, { damping: 6, stiffness: 200 }));
    x.value      = withDelay(delay, withSpring(tx, { damping: 8, stiffness: 80 }));
    y.value      = withDelay(delay, withSpring(ty, { damping: 8, stiffness: 80 }));
    rotate.value = withDelay(delay, withTiming(360, { duration: 1000, easing: Easing.out(Easing.quad) }));

    // Fade out
    opacity.value = withDelay(delay + 600, withTiming(0, { duration: 400 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[
      style,
      { position: 'absolute', width: size, height: size, borderRadius: size / 4, backgroundColor: color },
    ]} />
  );
}

function Confetti() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    angle: (i / 20) * 360 + Math.random() * 18 - 9,
    distance: 80 + Math.random() * 100,
    color: COLORS[i % COLORS.length],
    size: 6 + Math.random() * 6,
    delay: Math.random() * 120,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position: 'absolute', top: SH * 0.38, left: SW / 2 }}>
        {particles.map((p, i) => <ConfettiParticle key={i} {...p} />)}
      </View>
    </View>
  );
}

// ── Animated content wrapper (slide up + fade in) ─────────────────────────────
function AnimatedContent({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const translateY = useSharedValue(32);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(delay, withSpring(0, { damping: 16, stiffness: 180 }));
    opacity.value    = withDelay(delay, withTiming(1, { duration: 300 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

// ── Count-up number ───────────────────────────────────────────────────────────
function CountUp({ target }: { target: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame = 0;
    const total = 30;
    const timer = setInterval(() => {
      frame++;
      const eased = Math.round(target * (frame / total) ** 0.6);
      setDisplay(Math.min(eased, target));
      if (frame >= total) clearInterval(timer);
    }, 24);
    return () => clearInterval(timer);
  }, [target]);

  return <Text style={styles.bigNumber}>{display}</Text>;
}

// ── Main component ────────────────────────────────────────────────────────────
type Props = {
  visible: boolean;
  result: MatchResult | null;
  promptOption: { emoji: string; text: string } | null;
  onDismiss: () => void;
  onMakePlan: (userIds: string[]) => void;
};

export function MatchReveal({ visible, result, promptOption, onDismiss, onMakePlan }: Props) {
  if (!result) return null;
  const { state, matches, adjacentMatches } = result;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.overlay}>

        {/* Confetti only for State A */}
        {state === 'matches' && <Confetti />}

        <View style={styles.content}>
          {state === 'matches' && (
            <StateMatches
              matches={matches}
              promptOption={promptOption}
              onDismiss={onDismiss}
              onMakePlan={onMakePlan}
            />
          )}
          {state === 'first_in_circle' && (
            <StateFirstInCircle adjacentMatches={adjacentMatches} onDismiss={onDismiss} />
          )}
          {(state === 'first_in_network' || state === 'not_answered') && (
            <StateFirstInNetwork onDismiss={onDismiss} />
          )}
        </View>

        <View style={styles.tabBarDim} />
      </View>
    </Modal>
  );
}

function StateMatches({ matches, promptOption, onDismiss, onMakePlan }: {
  matches: MatchResult['matches'];
  promptOption: Props['promptOption'];
  onDismiss: () => void;
  onMakePlan: (ids: string[]) => void;
}) {
  return (
    <>
      <AnimatedContent delay={0}>
        {promptOption && (
          <View style={styles.echoPill}>
            <Text style={styles.echoText}>{promptOption.emoji} You all said: {promptOption.text}</Text>
          </View>
        )}
      </AnimatedContent>

      <AnimatedContent delay={80}>
        <CountUp target={matches.length} />
        <Text style={styles.bigSub}>people in your circle agree</Text>
      </AnimatedContent>

      <AnimatedContent delay={200}>
        <View style={styles.avatarRow}>
          {matches.slice(0, 3).map((m, i) => (
            <View key={m.userId} style={[styles.avatar, { zIndex: 3 - i, marginLeft: i === 0 ? 0 : -16 }]}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
          ))}
        </View>
        <Text style={styles.nameList}>
          {matches.slice(0, 3).map((m) => (m.name ?? '').split(' ')[0]).join(', ')}
        </Text>
      </AnimatedContent>

      {matches.some((m) => m.storyText) && (
        <AnimatedContent delay={320}>
          <View style={styles.storiesBlock}>
            {matches.filter((m) => m.storyText).slice(0, 3).map((m) => (
              <Text key={m.userId} style={styles.storyRow}>
                <Text style={styles.storyName}>{(m.name ?? '').split(' ')[0]} · </Text>
                <Text style={styles.storyQuote}>"{m.storyText}"</Text>
              </Text>
            ))}
          </View>
        </AnimatedContent>
      )}

      <AnimatedContent delay={440}>
        <TouchableOpacity
          style={styles.ctaPrimary}
          onPress={() => onMakePlan(matches.map((m) => m.userId))}
        >
          <Text style={styles.ctaPrimaryText}>Make a plan together →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctaSecondary} onPress={onDismiss}>
          <Text style={styles.ctaSecondaryText}>↓ Back to Discovery</Text>
        </TouchableOpacity>
      </AnimatedContent>
    </>
  );
}

function StateFirstInCircle({ adjacentMatches, onDismiss }: {
  adjacentMatches: MatchResult['adjacentMatches'];
  onDismiss: () => void;
}) {
  return (
    <>
      <AnimatedContent delay={0}>
        <Text style={styles.iconEmoji}>🌅</Text>
        <Text style={styles.warmHeading}>Nobody in your circle yet —</Text>
        <Text style={styles.warmSubHeading}>but these people nearby think the same</Text>
      </AnimatedContent>
      <AnimatedContent delay={150}>
        {adjacentMatches.slice(0, 2).map((m) => (
          <View key={m.userId} style={styles.adjacentRow}>
            <Text style={styles.adjacentEmoji}>👤</Text>
            <Text style={styles.adjacentName}>{m.name} · suggested</Text>
          </View>
        ))}
      </AnimatedContent>
      <AnimatedContent delay={280}>
        <View style={styles.notifToggle}>
          <View style={styles.notifTextBlock}>
            <Text style={styles.notifTitle}>Notify me when someone agrees</Text>
            <Text style={styles.notifSub}>Pre-set to ON for you</Text>
          </View>
          <Switch value={true} thumbColor="#fff" trackColor={{ true: '#FF6B35', false: '#555' }} />
        </View>
        <TouchableOpacity style={styles.ctaSecondary} onPress={onDismiss}>
          <Text style={styles.ctaSecondaryText}>↓ Swipe down to explore</Text>
        </TouchableOpacity>
      </AnimatedContent>
    </>
  );
}

function StateFirstInNetwork({ onDismiss }: { onDismiss: () => void }) {
  return (
    <>
      <AnimatedContent delay={0}>
        <View style={styles.iconBadge}>
          <Text style={styles.iconEmoji}>🌅</Text>
        </View>
        <Text style={styles.boldTake}>Bold take.</Text>
        <Text style={styles.rareText}>You might be rarer than you think.</Text>
        <Text style={styles.pingText}>We'll ping you the moment someone agrees.</Text>
      </AnimatedContent>
      <AnimatedContent delay={200}>
        <View style={styles.notifToggle}>
          <View style={styles.notifTextBlock}>
            <Text style={styles.notifTitle}>Notify me when someone agrees</Text>
            <Text style={styles.notifSub}>Pre-set to ON for you</Text>
          </View>
          <Switch value={true} thumbColor="#fff" trackColor={{ true: '#FF6B35', false: '#555' }} />
        </View>
        <TouchableOpacity style={styles.ctaSecondary} onPress={onDismiss}>
          <Text style={styles.ctaSecondaryText}>↓ Swipe down to explore</Text>
        </TouchableOpacity>
      </AnimatedContent>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 60 },
  tabBarDim: { height: 50, backgroundColor: 'rgba(255,255,255,0.04)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  echoPill: { backgroundColor: 'rgba(255,107,53,0.15)', borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16 },
  echoText: { fontSize: 11, color: '#FF6B35', fontFamily: Fonts.bodySemiBold },
  bigNumber: { fontSize: 56, fontFamily: Fonts.bodyBold, color: '#fff', lineHeight: 64, textAlign: 'center' },
  bigSub: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: Fonts.body, marginBottom: 20, textAlign: 'center' },
  avatarRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffe8dc', borderWidth: 3, borderColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24 },
  nameList: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: Fonts.body, marginBottom: 6, textAlign: 'center' },
  storiesBlock: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, width: '100%', marginBottom: 16 },
  storyRow: { marginBottom: 6 },
  storyName: { fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: Fonts.body },
  storyQuote: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontFamily: Fonts.headingRegular, fontStyle: 'italic' },
  ctaPrimary: { backgroundColor: '#FF6B35', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginBottom: 8 },
  ctaPrimaryText: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: '#fff' },
  ctaSecondary: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 24, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  ctaSecondaryText: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: Fonts.body },
  iconBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,107,53,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  iconEmoji: { fontSize: 36, textAlign: 'center', marginBottom: 12 },
  warmHeading: { fontFamily: Fonts.heading, fontSize: 18, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 4 },
  warmSubHeading: { fontFamily: Fonts.heading, fontSize: 18, color: '#fff', textAlign: 'center', marginBottom: 16 },
  adjacentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 10, width: '100%', marginBottom: 6, opacity: 0.6 },
  adjacentEmoji: { fontSize: 20 },
  adjacentName: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: Fonts.body },
  boldTake: { fontFamily: Fonts.heading, fontSize: 32, color: '#fff', textAlign: 'center', marginBottom: 6 },
  rareText: { fontFamily: Fonts.heading, fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 8 },
  pingText: { fontFamily: Fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 20 },
  notifToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, width: '100%', marginBottom: 16, gap: 12 },
  notifTextBlock: { flex: 1 },
  notifTitle: { fontSize: 11, fontFamily: Fonts.bodySemiBold, color: '#fff' },
  notifSub: { fontSize: 9, fontFamily: Fonts.body, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
});
