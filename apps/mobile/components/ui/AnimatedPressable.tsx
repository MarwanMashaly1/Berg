import React from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  pressScale?: number;
  haptic?: boolean;
  disabled?: boolean;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
};

/**
 * Drop-in replacement for TouchableOpacity with spring-physics press animation
 * and optional haptic feedback. Uses Reanimated 4 + Gesture Handler.
 */
export function AnimatedPressable({
  children,
  onPress,
  onLongPress,
  style,
  pressScale = 0.96,
  haptic = true,
  disabled = false,
  hitSlop,
}: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  function triggerHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      scale.value = withSpring(pressScale, { damping: 15, stiffness: 400 });
      opacity.value = withSpring(0.85, { damping: 20, stiffness: 400 });
    })
    .onEnd(() => {
      if (haptic && onPress) runOnJS(triggerHaptic)();
      if (onPress) runOnJS(onPress)();
    })
    .onFinalize(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      opacity.value = withSpring(1, { damping: 20, stiffness: 300 });
    });

  const longPress = Gesture.LongPress()
    .enabled(!disabled && !!onLongPress)
    .minDuration(400)
    .onStart(() => {
      if (haptic) runOnJS(triggerHaptic)();
      if (onLongPress) runOnJS(onLongPress)();
    });

  const composed = Gesture.Simultaneous(tap, longPress);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[style, animatedStyle, disabled && { opacity: 0.45 }]}
        hitSlop={hitSlop}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
