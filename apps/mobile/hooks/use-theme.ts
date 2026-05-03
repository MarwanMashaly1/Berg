import { useColorScheme } from 'react-native';
import { Colors, Fonts, Spacing, Radius, Shadow } from '../constants/theme';

export function useTheme() {
  const scheme = 'light'; // Berg is light-only; system dark mode must not override
  return {
    colors: Colors[scheme],
    fonts: Fonts,
    spacing: Spacing,
    radius: Radius,
    shadow: Shadow,
    isDark: scheme === 'dark',
  };
}
