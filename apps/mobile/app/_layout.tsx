import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PostHogProvider } from 'posthog-react-native';
import { posthog } from '../lib/posthog';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  DMSans_400Regular,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { queryClient, savePushToken } from '../lib/api';
import { Colors } from '../constants/theme';
import { registerForPushNotificationsAsync, handleNotificationTap } from '../lib/notifications';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    DMSans_400Regular,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  // Register for push notifications once fonts are loaded
  useEffect(() => {
    if (!fontsLoaded) return;

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        savePushToken(token).catch(() => {
          // Non-fatal — token registration failure should not crash the app
        });
      }
    });

    // Handle notification taps while app is foregrounded or in background
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationTap(response.notification);
    });

    return () => tapSub.remove();
  }, [fontsLoaded]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.light.backgroundWarm }} />;
  }

  return (
    <PostHogProvider client={posthog}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="(app)" />
          </Stack>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </PostHogProvider>
  );
}
