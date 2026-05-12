import { View, Text, Image, ViewStyle } from 'react-native';

type Props = {
  coverImage?: string | null;
  categoryEmoji: string;
  categoryColor: string;
  size?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

/**
 * Renders a circle's cover image if available, otherwise the emoji+color icon.
 * Used in circles list, discovery, profile pills, and chat headers.
 */
export function CircleIcon({
  coverImage,
  categoryEmoji,
  categoryColor,
  size = 44,
  borderRadius,
  style,
}: Props) {
  const r = borderRadius ?? size * 0.3;

  if (coverImage) {
    return (
      <Image
        source={{ uri: coverImage }}
        style={[{ width: size, height: size, borderRadius: r }, style]}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: categoryColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.42 }}>{categoryEmoji}</Text>
    </View>
  );
}
