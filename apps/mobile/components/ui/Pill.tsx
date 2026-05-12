import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/use-theme';
import { AnimatedPressable } from './AnimatedPressable';

type PillProps = {
  label: string;
  emoji?: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

export function Pill({ label, emoji, selected = false, onPress, style }: PillProps) {
  const { colors, fonts, radius } = useTheme();

  const pillStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: selected ? 0 : 1.5,
    backgroundColor: selected ? colors.primary : colors.surface,
    borderColor: colors.border,
    gap: 5,
    shadowColor: selected ? colors.primary : colors.cardShadowColor,
    shadowOffset: { width: 0, height: selected ? 3 : 1 },
    shadowOpacity: selected ? 0.25 : 0.05,
    shadowRadius: selected ? 8 : 3,
    elevation: selected ? 3 : 1,
  };

  const content = (
    <View style={[pillStyle, style]}>
      {emoji && <Text style={{ fontSize: 14 }}>{emoji}</Text>}
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
      <AnimatedPressable onPress={onPress} pressScale={0.93} haptic={true}>
        {content}
      </AnimatedPressable>
    );
  }

  return content;
}
