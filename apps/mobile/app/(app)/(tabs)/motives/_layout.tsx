import { Stack } from 'expo-router';
import { Colors } from '../../../../constants/theme';

export default function MotivesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.light.backgroundWarm },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="[id]/edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[id]/memory" />
      <Stack.Screen name="[id]/memories" />
      <Stack.Screen name="[id]/memory-card" />
    </Stack>
  );
}
