import { Stack } from 'expo-router';

export default function ChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      {/* [align-4] Hidden — standalone group chats are off-product. See PRODUCT_NORTH_STAR.md. Re-enable if product scope changes. */}
      {/* <Stack.Screen name="new-group" options={{ presentation: 'modal' }} /> */}
    </Stack>
  );
}
