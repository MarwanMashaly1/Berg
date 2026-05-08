import React from 'react';
import { View, Text, Image, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../../hooks/use-theme';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<Size, number> = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 56,
  xl: 80,
};

// 6 distinct colors — all work with white text
const AVATAR_COLORS = [
  '#E8570A', // deep orange
  '#2D6A4F', // dark green
  '#2563EB', // blue
  '#7C3AED', // purple
  '#B45309', // amber
  '#0891B2', // teal
] as const;

function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  userId?: string | null;
  size?: Size;
  style?: StyleProp<ViewStyle>;
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ uri, name, userId, size = 'md', style }: AvatarProps) {
  const { colors, fonts } = useTheme();
  const dimension = SIZE_MAP[size];
  const fontSize = dimension * 0.35;
  const hasPersonalColor = !!userId;
  const bg = hasPersonalColor ? hashColor(userId) : colors.primaryMuted;
  const textColor = hasPersonalColor ? '#FFFFFF' : colors.primary;

  return (
    <View
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          backgroundColor: bg,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: dimension, height: dimension }}
          resizeMode="cover"
        />
      ) : (
        <Text
          style={{
            fontFamily: fonts.bodySemiBold,
            fontSize,
            color: textColor,
          }}
        >
          {name ? getInitials(name) : '?'}
        </Text>
      )}
    </View>
  );
}
