import { useEffect } from 'react';
import { View, LogBox } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useNavigationContainerRef, usePathname } from 'expo-router';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Suppress all dev overlays — Sentry captures everything
LogBox.ignoreAllLogs();
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PostHogProvider } from 'posthog-react-native';
import { posthog } from '../lib/posthog';

// Auto-tracks every route change to PostHog — placed inside the navigator
function ScreenTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) posthog.screen(pathname);
  }, [pathname]);
  return null;
}
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
  const navigationRef = useNavigationContainerRef();

  // DEBUG: log every incoming deep link so we can see if berg:/// callback arrives
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      console.log('[deeplink] initial URL:', url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      console.log('[deeplink] received:', url);
      WebBrowser.maybeCompleteAuthSession();
    });
    return () => sub.remove();
  }, []);

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

    registerForPushNotificationsAsync()
      .then((token) => {
        if (token) savePushToken(token).catch(() => {});
      })
      .catch(() => {});

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
    <ErrorBoundary>
      <PostHogProvider client={posthog}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" backgroundColor={Colors.light.backgroundWarm} translucent={false} />
            <Stack ref={navigationRef} screenOptions={{ headerShown: false, animation: 'fade' }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="(app)" />
            </Stack>
            <ScreenTracker />
          </QueryClientProvider>
        </GestureHandlerRootView>
      </PostHogProvider>
    </ErrorBoundary>
  );
}
