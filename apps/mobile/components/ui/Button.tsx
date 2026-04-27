import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../../hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'ghost';
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
}: ButtonProps) {
  const { colors, fonts, radius } = useTheme();

  const isDisabled = disabled || loading;

  const containerStyle: ViewStyle[] = [
    styles.base,
    {
      borderRadius: radius.md,
      ...(fullWidth && { alignSelf: 'stretch' }),
      ...(isDisabled && { opacity: 0.5 }),
    },
    // Size
    size === 'sm' && styles.sm,
    size === 'md' && styles.md,
    size === 'lg' && styles.lg,
    // Variant
    variant === 'primary' && { backgroundColor: colors.primary },
    variant === 'secondary' && {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    variant === 'ghost' && { backgroundColor: 'transparent' },
    style,
  ].filter(Boolean) as ViewStyle[];

  const labelStyle: TextStyle[] = [
    { fontFamily: fonts.bodySemiBold, fontSize: 16 },
    variant === 'primary' && { color: colors.textInverse },
    variant === 'secondary' && { color: colors.primary },
    variant === 'ghost' && { color: colors.textSecondary },
    size === 'sm' && { fontSize: 14 },
    size === 'lg' && { fontSize: 18 },
    textStyle,
  ].filter(Boolean) as TextStyle[];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={containerStyle}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.textInverse : colors.primary}
          size="small"
        />
      ) : (
        <Text style={labelStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: { paddingHorizontal: 16, paddingVertical: 8, minHeight: 36 },
  md: { paddingHorizontal: 20, paddingVertical: 14, minHeight: 48 },
  lg: { paddingHorizontal: 24, paddingVertical: 18, minHeight: 56 },
});
