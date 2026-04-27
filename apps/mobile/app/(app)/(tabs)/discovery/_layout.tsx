import { Stack } from 'expo-router';
import { Colors } from '../../../../constants/theme';

// Simple Stack navigator to make discovery consistent with other tabs
// (motives, chat, profile all have _layout.tsx — discovery needs one too
//  so Expo Router processes all four tabs the same way)
export default function DiscoveryLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.light.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
