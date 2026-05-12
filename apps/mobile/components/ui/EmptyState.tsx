import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/use-theme';
import { Button } from './Button';

type EmptyStateProps = {
  emoji: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
};

/**
 * Consistent empty state for all screens. Shows an emoji, title, optional
 * subtitle, and optional CTA button.
 */
export function EmptyState({
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const { colors, fonts } = useTheme();

  return (
    <View
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 40,
          paddingVertical: 48,
          gap: 8,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 52, marginBottom: 8 }}>{emoji}</Text>
      <Text
        style={{
          fontFamily: fonts.heading,
          fontSize: 22,
          color: colors.text,
          textAlign: 'center',
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 15,
            color: colors.textTertiary,
            textAlign: 'center',
            lineHeight: 22,
            marginTop: 2,
          }}
        >
          {subtitle}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="primary"
          size="md"
          style={{ marginTop: 16 }}
        />
      )}
    </View>
  );
}
