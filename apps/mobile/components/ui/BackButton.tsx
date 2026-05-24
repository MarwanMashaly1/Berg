import { TouchableOpacity, View, StyleSheet, GestureResponderEvent } from 'react-native';
import { router } from 'expo-router';
import { C } from '../../constants/theme';

type Props = {
  /** 'light' for cream/white backgrounds, 'dark' for dark hero surfaces */
  variant?: 'light' | 'dark';
  onPress?: (e: GestureResponderEvent) => void;
};

/**
 * Consistent circular back button used across all screens.
 *
 * light (default) — white circle on cream background
 *   bg: C.surface  border: C.border  chevron: C.textSecondary
 *
 * dark — translucent white circle on dark surfaces (profile hero, chat dark bg, etc.)
 *   bg: rgba(255,255,255,0.12)  border: rgba(255,255,255,0.18)  chevron: rgba(242,232,220,0.8)
 */
export function BackButton({ variant = 'light', onPress }: Props) {
  const handlePress = onPress ?? (() => router.back());

  const isLight = variant === 'light';
  const bg      = isLight ? C.surface              : 'rgba(255,255,255,0.12)';
  const border  = isLight ? C.border               : 'rgba(255,255,255,0.18)';
  const chevron = isLight ? C.textSecondary        : 'rgba(242,232,220,0.8)';

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg, borderColor: border }]}
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
    >
      {/* Left-pointing chevron drawn with two rotated lines */}
      <View style={styles.chevronWrap}>
        <View style={[styles.top, { backgroundColor: chevron }]} />
        <View style={[styles.bot, { backgroundColor: chevron }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chevronWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -2, // optical alignment
  },
  // Top arm of the chevron (angled upper-left)
  top: {
    position: 'absolute',
    width: 8,
    height: 2,
    borderRadius: 1,
    top: 2,
    left: 2,
    transform: [{ rotate: '-45deg' }],
  },
  // Bottom arm of the chevron (angled lower-left)
  bot: {
    position: 'absolute',
    width: 8,
    height: 2,
    borderRadius: 1,
    bottom: 2,
    left: 2,
    transform: [{ rotate: '45deg' }],
  },
});
