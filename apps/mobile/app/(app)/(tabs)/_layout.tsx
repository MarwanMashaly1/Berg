import { useEffect } from 'react';
import { View } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useCurrentUser } from '../../../hooks/use-current-user';
import { C } from '../../../constants/theme';
import { IconSymbol } from '../../../components/ui/icon-symbol';
import { identifyUser, trackScreen } from '../../../lib/analytics';
import * as Sentry from '@sentry/react-native';

function TabIcon({
  name,
  active,
}: {
  name: React.ComponentProps<typeof IconSymbol>['name'];
  active: boolean;
}) {
  const scale = useSharedValue(active ? 1 : 0.85);

  useEffect(() => {
    scale.value = withSpring(active ? 1 : 0.85, { damping: 15, stiffness: 300 });
  }, [active]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={animStyle}>
        <IconSymbol
          name={name}
          size={22}
          color={active ? C.primary : C.tabIconDefault}
        />
      </Animated.View>
    </View>
  );
}

export default function TabsLayout() {
  const { user, isPending } = useCurrentUser();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!isPending && !user) {
      router.replace('/(auth)/welcome');
    }
  }, [user, isPending]);

  // Identify user once session is known
  useEffect(() => {
    if (user) {
      identifyUser(user.id, { name: user.name, email: user.email });
      Sentry.setUser({ id: user.id, email: user.email ?? undefined, username: user.name ?? undefined });
    } else if (!isPending) {
      Sentry.setUser(null);
    }
  }, [user?.id, isPending]);

  // Track every screen change
  useEffect(() => {
    if (pathname) trackScreen(pathname);
  }, [pathname]);

  if (isPending || !user) return null;

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
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="discovery"
        options={{
          title: 'Discover',
          unmountOnBlur: true,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="sparkles" active={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="motives"
        options={{
          title: 'Motives',
          unmountOnBlur: true,
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
        listeners={({ navigation }) => ({
          focus: () => navigation.navigate('chat', { screen: 'index' }),
        })}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          unmountOnBlur: true,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="person.circle" active={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
