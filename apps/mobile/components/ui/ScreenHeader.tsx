import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from './BackButton';
import { C, Fonts } from '../../constants/theme';
import type { ReactNode } from 'react';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  backVariant?: 'light' | 'dark';
  onBackPress?: () => void;
  right?: ReactNode;
  border?: boolean;
  paddingHorizontal?: number;
}

export function ScreenHeader({
  title,
  showBack = true,
  backVariant = 'light',
  onBackPress,
  right,
  border = true,
  paddingHorizontal = 18,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: C.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal,
          paddingVertical: 8,
          borderBottomWidth: border ? 1 : 0,
          borderBottomColor: C.border,
        }}
      >
        {showBack ? (
          <BackButton variant={backVariant} onPress={onBackPress} />
        ) : (
          <View style={{ width: 36 }} />
        )}
        <Text
          style={{
            fontFamily: Fonts.bodySemiBold,
            fontSize: 16,
            color: C.text,
          }}
        >
          {title}
        </Text>
        <View style={{ width: 36, alignItems: 'flex-end' }}>
          {right ?? null}
        </View>
      </View>
    </View>
  );
}
