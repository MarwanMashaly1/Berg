import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';

// Show alerts and play sound for all incoming notifications while app is foregrounded.
// This is safe to call in Expo Go — it only configures foreground behaviour.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * True when running inside Expo Go.
 * getExpoPushTokenAsync() requires an EAS projectId and crashes in Expo Go
 * without one — we skip token registration but keep handlers working.
 */
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  (Constants as any).executionEnvironment === 'storeClient';

/**
 * Request notification permissions and return the Expo push token.
 *
 * Returns null (without crashing) when:
 * - Running in Expo Go  — push tokens unavailable, but the app keeps working
 * - Permission denied   — user said no
 * - Web platform        — not supported
 * - Any other error     — fail silently so a token issue never crashes the app
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Expo Go: skip token request silently — everything else (handlers, routing) works fine
  if (isExpoGo) {
    if (__DEV__) console.log('[notifications] Expo Go detected — push token registration skipped');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B35',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    // Pass projectId from EAS config so dev builds work without extra setup
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenData.data;
  } catch (e) {
    if (__DEV__) console.warn('[notifications] Failed to get push token:', e);
    return null;
  }
}

/**
 * Handle a notification tap and deep-link to the right screen.
 * Call this from the addNotificationResponseReceivedListener callback.
 * Works in both Expo Go and production builds.
 */
export function handleNotificationTap(notification: Notifications.Notification): void {
  const data = notification.request.content.data as Record<string, string> | undefined;
  if (!data?.screen) return;

  switch (data.screen) {
    case 'motives':
      if (data.motiveId) {
        const suffix = data.path ? `/${data.path}` : '';
        router.push(`/(app)/(tabs)/motives/${data.motiveId}${suffix}` as any);
      }
      break;
    case 'chat':
      if (data.chatId) router.push(`/(app)/(tabs)/chat/${data.chatId}` as any);
      break;
    case 'discovery':
      router.push('/(app)/(tabs)/discovery' as any);
      break;
    case 'connections':
      router.push('/(app)/(tabs)/profile/connections' as any);
      break;
    case 'circle':
      if (data.circleId) {
        router.push({
          pathname: '/(app)/(tabs)/profile/circle-detail',
          params: { id: data.circleId },
        } as any);
      }
      break;
    // [align-1] Motive-mappable match: deep-link to motive creation pre-filled
    case 'motive/create':
      router.push({
        pathname: '/(app)/(tabs)/motives/create',
        params: {
          prefillCategory: data.optionKey ?? undefined,
          prefillUsers: data.suggestedAttendees
            ? JSON.stringify((data.suggestedAttendees as unknown as string[]).map((id: string) => ({ id, name: null, username: null })))
            : undefined,
          originPromptId: data.promptId ?? undefined,
        },
      } as any);
      break;
    // [align-1] Conversational match: deep-link to match-detail view
    case 'match-detail':
      if (data.promptId) {
        router.push({
          pathname: '/(app)/match-detail',
          params: { promptId: data.promptId, optionKey: data.optionKey ?? undefined },
        } as any);
      }
      break;
  }
}
