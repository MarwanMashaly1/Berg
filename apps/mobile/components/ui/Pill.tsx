import React from 'react';
import { TouchableOpacity, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/use-theme';

type PillProps = {
  label: string;
  emoji?: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

export function Pill({ label, emoji, selected = false, onPress, style }: PillProps) {
  const { colors, fonts, radius } = useTheme();

  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: radius.full,
          borderWidth: 1.5,
          backgroundColor: selected ? colors.primary : colors.surfaceAlt,
          borderColor: selected ? colors.primary : colors.border,
          gap: 4,
        },
        style,
      ]}
    >
      {emoji && (
        <Text style={{ fontSize: 14 }}>{emoji}</Text>
      )}
      <Text
        style={{
          fontFamily: fonts.bodySemiBold,
          fontSize: 13,
          color: selected ? colors.textInverse : colors.text,
        }}
      >
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}
