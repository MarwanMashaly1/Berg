import React from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type ButtonProps = {
  onPress: () => void;
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  icon?: React.ReactNode;
};

export function Button({
  onPress,
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
  icon,
}: ButtonProps) {
  const { colors, fonts, radius } = useTheme();
  const isDisabled = disabled || loading;

  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
  }

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }

  const baseContainer: ViewStyle = {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...(fullWidth && { alignSelf: 'stretch' }),
    ...(isDisabled && { opacity: 0.5 }),
  };

  const sizeStyle: ViewStyle =
    size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : styles.md;

  const labelStyle: TextStyle[] = [
    { fontFamily: fonts.bodySemiBold },
    size === 'sm' && { fontSize: 14 },
    size === 'md' && { fontSize: 16 },
    size === 'lg' && { fontSize: 18 },
    variant === 'primary' && { color: '#FFFFFF' },
    variant === 'secondary' && { color: colors.primary },
    variant === 'ghost' && { color: colors.textSecondary },
    variant === 'danger' && { color: '#FFFFFF' },
    textStyle,
  ].filter(Boolean) as TextStyle[];

  const spinnerColor =
    variant === 'primary' || variant === 'danger' ? '#FFFFFF' : colors.primary;

  const content = loading ? (
    <ActivityIndicator color={spinnerColor} size="small" />
  ) : (
    <>
      {icon}
      <Text style={labelStyle}>{label}</Text>
    </>
  );

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={fullWidth ? { alignSelf: 'stretch' } : undefined}
    >
      <Animated.View style={[animatedStyle, fullWidth && { alignSelf: 'stretch' }]}>
        {variant === 'primary' ? (
          <LinearGradient
            colors={['#FF8050', '#FF6B35']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[baseContainer, sizeStyle, styles.primaryShadow, style]}
          >
            {content}
          </LinearGradient>
        ) : variant === 'danger' ? (
          <View style={[baseContainer, sizeStyle, { backgroundColor: colors.error }, style]}>
            {content}
          </View>
        ) : variant === 'secondary' ? (
          <View
            style={[
              baseContainer,
              sizeStyle,
              { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'transparent' },
              style,
            ]}
          >
            {content}
          </View>
        ) : (
          <View style={[baseContainer, sizeStyle, { backgroundColor: 'transparent' }, style]}>
            {content}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sm: { paddingHorizontal: 16, paddingVertical: 9, minHeight: 36 },
  md: { paddingHorizontal: 20, paddingVertical: 15, minHeight: 50 },
  lg: { paddingHorizontal: 24, paddingVertical: 18, minHeight: 56 },
  primaryShadow: {
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
});
