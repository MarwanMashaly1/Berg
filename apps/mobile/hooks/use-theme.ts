import { useColorScheme } from 'react-native';
import { Colors, Fonts, Spacing, Radius, Shadow } from '../constants/theme';

export function useTheme() {
  const scheme = useColorScheme() ?? 'light';
  return {
    colors: Colors[scheme],
    fonts: Fonts,
    spacing: Spacing,
    radius: Radius,
    shadow: Shadow,
    isDark: scheme === 'dark',
  };
}
