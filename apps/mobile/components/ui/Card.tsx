import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/use-theme';

type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
};

export function Card({ children, style, elevated = false }: CardProps) {
  const { colors, radius, shadow } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
        },
        elevated && shadow.md,
        style,
      ]}
    >
      {children}
    </View>
  );
}
