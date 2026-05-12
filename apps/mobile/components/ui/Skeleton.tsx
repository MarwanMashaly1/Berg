import { useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

type Props = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: Props) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: '#E8E0D5',
        },
        animStyle,
        style,
      ]}
    />
  );
}

export function SkeletonText({ lines = 2 }: { lines?: number }) {
  return (
    <View style={{ gap: 7 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '65%' : '90%'} borderRadius={6} />
      ))}
    </View>
  );
}

export function SkeletonPersonCard() {
  return (
    <View
      style={{
        width: 152,
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 14,
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
        shadowColor: '#8B6A4A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <Skeleton width={56} height={56} borderRadius={28} />
      <Skeleton width={80} height={12} borderRadius={6} />
      <Skeleton width={100} height={10} borderRadius={5} />
      <Skeleton width={120} height={32} borderRadius={10} style={{ marginTop: 4 }} />
    </View>
  );
}

export function SkeletonChatRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      <Skeleton width={46} height={46} borderRadius={23} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width={120} height={13} borderRadius={6} />
        <Skeleton width={180} height={11} borderRadius={5} />
      </View>
      <Skeleton width={30} height={10} borderRadius={5} />
    </View>
  );
}

export function SkeletonMotiveCard() {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        marginHorizontal: 16,
        marginBottom: 10,
        overflow: 'hidden',
        shadowColor: '#8B6A4A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <Skeleton width="100%" height={3} borderRadius={0} style={{ opacity: 0.4 }} />
      <View style={{ padding: 14, gap: 9 }}>
        <Skeleton width="75%" height={15} borderRadius={6} />
        <Skeleton width="55%" height={12} borderRadius={5} />
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={24} height={24} borderRadius={12} style={{ marginLeft: i > 0 ? -8 : 0 }} />
          ))}
        </View>
      </View>
    </View>
  );
}

export function SkeletonCircleRow() {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 14,
        marginBottom: 8,
        shadowColor: '#8B6A4A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <Skeleton width={44} height={44} borderRadius={13} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width={120} height={13} borderRadius={6} />
        <Skeleton width={80} height={11} borderRadius={5} />
      </View>
      <Skeleton width={50} height={32} borderRadius={10} />
    </View>
  );
}

export function SkeletonProfileHeader() {
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 20 }}>
      <Skeleton width={88} height={88} borderRadius={44} />
      <Skeleton width={140} height={18} borderRadius={8} />
      <Skeleton width={200} height={13} borderRadius={6} />
      <View style={{ flexDirection: 'row', gap: 24, marginTop: 4 }}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Skeleton width={36} height={20} borderRadius={6} />
          <Skeleton width={60} height={11} borderRadius={5} />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Skeleton width={36} height={20} borderRadius={6} />
          <Skeleton width={60} height={11} borderRadius={5} />
        </View>
      </View>
    </View>
  );
}
