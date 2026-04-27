import { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle } from 'react-native';

type Props = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

/**
 * Pulsing skeleton loader — use instead of empty views while content loads.
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: '#E8E0D5',
          opacity,
        },
        style,
      ]}
    />
  );
}

/** A row of skeleton lines mimicking a text block. */
export function SkeletonText({ lines = 2 }: { lines?: number }) {
  return (
    <View style={{ gap: 7 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? '65%' : '90%'}
          borderRadius={6}
        />
      ))}
    </View>
  );
}

/** Skeleton for a horizontal person card. */
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
      }}
    >
      <Skeleton width={56} height={56} borderRadius={28} />
      <Skeleton width={80} height={12} borderRadius={6} />
      <Skeleton width={100} height={10} borderRadius={5} />
      <Skeleton width={120} height={32} borderRadius={10} style={{ marginTop: 4 }} />
    </View>
  );
}

/** Skeleton for a chat list row. */
export function SkeletonChatRow() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Skeleton width={46} height={46} borderRadius={23} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width={120} height={12} borderRadius={6} />
        <Skeleton width={180} height={10} borderRadius={5} />
      </View>
      <Skeleton width={30} height={10} borderRadius={5} />
    </View>
  );
}

/** Skeleton for a motive card. */
export function SkeletonMotiveCard() {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        marginHorizontal: 16,
        marginBottom: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
      }}
    >
      <Skeleton width='100%' height={3} borderRadius={0} style={{ opacity: 0.4 }} />
      <View style={{ padding: 13, gap: 8 }}>
        <Skeleton width='75%' height={14} borderRadius={6} />
        <Skeleton width='55%' height={11} borderRadius={5} />
        <View style={{ flexDirection: 'row', gap: 0, marginTop: 2 }}>
          {[0, 1, 2].map(i => (
            <Skeleton key={i} width={22} height={22} borderRadius={11} style={{ marginLeft: i > 0 ? -7 : 0 }} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** Skeleton for a circle suggestion row. */
export function SkeletonCircleRow() {
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff', borderRadius: 16,
        padding: 13, marginBottom: 8,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
      }}
    >
      <Skeleton width={44} height={44} borderRadius={13} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width={120} height={12} borderRadius={6} />
        <Skeleton width={80} height={10} borderRadius={5} />
      </View>
      <Skeleton width={50} height={30} borderRadius={10} />
    </View>
  );
}
