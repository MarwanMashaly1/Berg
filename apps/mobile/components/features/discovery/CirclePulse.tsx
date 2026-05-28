import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, Fonts } from '../../../constants/theme';
import { PulseCard } from '../../../lib/api';

type Props = {
  cards: PulseCard[];
  onAction: (card: PulseCard) => void;
};

export function CirclePulse({ cards, onAction }: Props) {
  if (cards.length === 0) return null;

  return (
    <View style={styles.section}>
      {cards.map((card, i) => (
        <TouchableOpacity key={i} style={styles.card} onPress={() => onAction(card)} activeOpacity={0.8}>
          <Text style={styles.emoji}>{card.emoji}</Text>
          <Text style={styles.text}>{card.text}</Text>
          <Text style={styles.action}>{card.actionLabel} →</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 12, marginTop: 10, marginBottom: 20, gap: 6 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: C.border,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  emoji: { fontSize: 18 },
  text: { flex: 1, fontSize: 11, color: C.text, fontFamily: Fonts.body, lineHeight: 16 },
  action: { fontSize: 10, color: C.primary, fontFamily: Fonts.bodySemiBold },
});
