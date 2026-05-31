import { TouchableOpacity, StyleSheet, GestureResponderEvent } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { C } from '../../constants/theme';

type Props = {
  /** 'light' for cream/white backgrounds, 'dark' for dark hero surfaces */
  variant?: 'light' | 'dark';
  onPress?: (e: GestureResponderEvent) => void;
};

export function BackButton({ variant = 'light', onPress }: Props) {
  const handlePress = onPress ?? (() => router.back());

  const isLight = variant === 'light';
  const bg      = isLight ? C.surface                   : 'rgba(255,255,255,0.12)';
  const border  = isLight ? C.border                    : 'rgba(255,255,255,0.18)';
  const iconColor = isLight ? C.textSecondary            : 'rgba(242,232,220,0.8)';

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg, borderColor: border }]}
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
    >
      <MaterialIcons name="chevron-left" size={24} color={iconColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
