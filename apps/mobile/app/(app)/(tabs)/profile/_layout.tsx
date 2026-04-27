import { Stack } from 'expo-router';
import { Colors } from '../../../../constants/theme';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.light.backgroundWarm },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="edit" />
      <Stack.Screen name="connections" />
      <Stack.Screen name="circles" />
      <Stack.Screen name="circle-detail" />
      <Stack.Screen name="create-circle" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
