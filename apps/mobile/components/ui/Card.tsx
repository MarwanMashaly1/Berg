import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/use-theme';
import { AnimatedPressable } from './AnimatedPressable';

type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** 'filled' = white surface (default), 'warm' = warm cream tint */
  surface?: 'filled' | 'warm';
};

export function Card({
  children,
  style,
  elevated = false,
  onPress,
  onLongPress,
  surface = 'filled',
}: CardProps) {
  const { colors, radius } = useTheme();

  const bg = surface === 'warm' ? colors.surfaceAlt : colors.surface;

  const cardStyle: ViewStyle[] = [
    {
      backgroundColor: bg,
      borderRadius: radius.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.borderWarm,
    },
    elevated && {
      shadowColor: colors.cardShadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 5,
      borderColor: 'transparent',
    },
    style,
  ].filter(Boolean) as ViewStyle[];

  if (onPress || onLongPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={cardStyle}
        pressScale={0.98}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}
