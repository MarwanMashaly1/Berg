import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useCurrentUser } from '../../hooks/use-current-user';
import { C } from '../../constants/theme';
import { Routes } from '../../lib/routes';

export default function ConnectDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isPending } = useCurrentUser();

  useEffect(() => {
    if (isPending) return;
    if (!id) { router.replace('/(auth)/welcome'); return; }

    if (user) {
      router.replace(Routes.userProfile(id));
    } else {
      // Not logged in — send to welcome; after auth they can re-scan
      router.replace('/(auth)/welcome');
    }
  }, [isPending, user, id]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background }}>
      <ActivityIndicator color={C.primary} />
    </View>
  );
}
