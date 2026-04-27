import { useEffect } from 'react';
import { Tabs, router, usePathname } from 'expo-router';
import { View } from 'react-native';
import { authClient } from '../../../lib/auth';
import { Colors } from '../../../constants/theme';
import { IconSymbol } from '../../../components/ui/icon-symbol';
import { identifyUser, trackScreen } from '../../../lib/analytics';

const C = Colors.light;

function TabIcon({
  name,
  active,
}: {
  name: React.ComponentProps<typeof IconSymbol>['name'];
  active: boolean;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        backgroundColor: active ? 'rgba(255,107,53,0.10)' : 'transparent',
        minWidth: 40,
      }}
    >
      <IconSymbol
        name={name}
        size={22}
        color={active ? C.primary : C.tabIconDefault}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { data: session, isPending } = authClient.useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !session) {
      router.replace('/(auth)/welcome');
    }
  }, [session, isPending]);

  // Identify user once session is known
  useEffect(() => {
    if (session?.user) {
      identifyUser(session.user.id, { name: session.user.name, email: session.user.email });
    }
  }, [session?.user?.id]);

  // Track every screen change
  useEffect(() => {
    if (pathname) trackScreen(pathname);
  }, [pathname]);

  if (isPending || !session) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.tabIconDefault,
        tabBarLabelStyle: {
          fontFamily: 'DMSans_600SemiBold',
          fontSize: 10,
          letterSpacing: 0.2,
          marginTop: -2,
        },
        tabBarStyle: {
          backgroundColor: 'rgba(248,242,232,0.97)',
          borderTopColor: 'rgba(0,0,0,0.08)',
          borderTopWidth: 1,
          height: 58,
          paddingBottom: 8,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="discovery"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="sparkles" active={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="motives"
        options={{
          title: 'Motives',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="calendar" active={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="message" active={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="person.circle" active={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
