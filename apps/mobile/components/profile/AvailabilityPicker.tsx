import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, Fonts } from '../../constants/theme';

const AVAIL_OPTIONS = [
  { value: 'down_to_hang', emoji: '🟢', label: 'Down to hang', color: '#2D6A4F', bg: 'rgba(45,106,79,0.12)' },
  { value: 'ask_me',       emoji: '🟡', label: 'Ask me',       color: '#B7791F', bg: 'rgba(183,121,31,0.12)' },
  { value: 'busy',         emoji: '🔴', label: 'Busy',         color: '#C53030', bg: 'rgba(197,48,48,0.10)' },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function AvailabilityPicker({ value, onChange }: Props) {
  const currentAvail = AVAIL_OPTIONS.find(o => o.value === value) ?? AVAIL_OPTIONS[0];

  return (
    <View style={styles.availPicker}>
      {AVAIL_OPTIONS.map(opt => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.availPickerOption, value === opt.value && { backgroundColor: opt.bg, borderColor: opt.color }]}
          onPress={() => onChange(opt.value)}
        >
          <Text style={styles.availPickerEmoji}>{opt.emoji}</Text>
          <Text style={[styles.availPickerLabel, value === opt.value && { color: opt.color }]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export { AVAIL_OPTIONS };

const styles = StyleSheet.create({
  availPicker: { marginTop: 10, flexDirection: 'row', gap: 6 },
  availPickerOption: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  availPickerEmoji: { fontSize: 16 },
  availPickerLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: 'rgba(242,232,220,0.5)',
    textAlign: 'center',
  },
});
