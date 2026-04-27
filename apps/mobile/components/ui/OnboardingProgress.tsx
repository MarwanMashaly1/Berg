import { View, StyleSheet } from 'react-native';
import { Colors } from '../../constants/theme';

const C = Colors.light;
const TOTAL_STEPS = 6;

type Props = { currentStep: number }; // 1-6

export function OnboardingProgress({ currentStep }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            i < currentStep ? styles.active : styles.inactive,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2 },
  active: { backgroundColor: C.primary },
  inactive: { backgroundColor: C.border },
});
