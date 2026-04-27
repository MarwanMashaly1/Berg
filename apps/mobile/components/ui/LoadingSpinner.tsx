import React from 'react';
import { ActivityIndicator, View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/use-theme';

type LoadingSpinnerProps = {
  size?: 'small' | 'large';
  color?: string;
  style?: ViewStyle;
  fullScreen?: boolean;
};

export function LoadingSpinner({
  size = 'large',
  color,
  style,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        fullScreen && { flex: 1, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <ActivityIndicator size={size} color={color ?? colors.primary} />
    </View>
  );
}
