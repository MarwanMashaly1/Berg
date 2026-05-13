import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { authClient } from '../../lib/auth';
import { Colors } from '../../constants/theme';

const C = Colors.light;

export default function ConnectDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (!id) { router.replace('/(auth)/welcome'); return; }

    if (session) {
      router.replace({ pathname: '/(app)/user/[id]', params: { id } } as any);
    } else {
      // Not logged in — send to welcome; after auth they can re-scan
      router.replace('/(auth)/welcome');
    }
  }, [isPending, session, id]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background }}>
      <ActivityIndicator color={C.primary} />
    </View>
  );
}
