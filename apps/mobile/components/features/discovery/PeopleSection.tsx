import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors, Fonts } from '../../../constants/theme';
import { PersonSuggestion } from '../../../lib/api';
import { Avatar } from '../../ui/Avatar';
import { SkeletonPersonCard } from '../../ui/Skeleton';

const C = Colors.light;

const MAX_VISIBLE = 6; // show at most 6 cards, then "See more →"

type Props = {
  people: PersonSuggestion[];
  loading: boolean;
};

function PersonCard({ person }: { person: PersonSuggestion }) {
  function handleTap() {
    router.push({
      pathname: '/(app)/user/[id]',
      params: {
        id: person.id,
        name: person.name ?? '',
        avatarUrl: person.avatarUrl ?? '',
      },
    } as any);
  }

  return (
    <TouchableOpacity style={styles.card} onPress={handleTap} activeOpacity={0.82}>
      <Avatar
        name={person.name}
        userId={person.id}
        uri={person.avatarUrl}    // shows photo if available, falls back to initials
        size="lg"
        style={{ marginBottom: 10 }}
      />
      <Text style={styles.cardName} numberOfLines={1}>
        {person.name ?? 'Someone'}
      </Text>
      {person.mutualFriendName ? (
        <Text style={styles.cardMeta} numberOfLines={1}>via {person.mutualFriendName}</Text>
      ) : null}
      {person.sharedVibeTags.length > 0 && (
        <View style={styles.tagsWrap}>
          {person.sharedVibeTags.slice(0, 2).map(tag => (
            <View key={tag.label} style={styles.tag}>
              <Text style={styles.tagText}>{tag.emoji} {tag.label}</Text>
            </View>
          ))}
        </View>
      )}
      {/* Connect button at bottom */}
      <View style={styles.connectBtn}>
        <Text style={styles.connectText}>Connect</Text>
      </View>
    </TouchableOpacity>
  );
}

function SeeMoreCard({ count }: { count: number }) {
  return (
    <TouchableOpacity
      style={styles.seeMoreCard}
      onPress={() => router.push('/(app)/discover-people' as any)}
      activeOpacity={0.82}
    >
      <View style={styles.seeMoreIcon}>
        <Text style={styles.seeMoreIconText}>{count}</Text>
      </View>
      <Text style={styles.seeMoreLabel}>See more</Text>
      <Text style={styles.seeMoreSub}>people you might know</Text>
      <View style={styles.seeMoreArrow}>
        <View style={styles.arrowChevron} />
      </View>
    </TouchableOpacity>
  );
}

export function PeopleSection({ people, loading }: Props) {
  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>People you might know</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {[0, 1, 2].map(i => <SkeletonPersonCard key={i} />)}
        </ScrollView>
      </View>
    );
  }

  if (people.length === 0) return null;

  const visible = people.slice(0, MAX_VISIBLE);
  const remaining = people.length - MAX_VISIBLE;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>People you might know</Text>
        {people.length > MAX_VISIBLE && (
          <TouchableOpacity onPress={() => router.push('/(app)/discover-people' as any)}>
            <Text style={styles.seeAllLink}>See all {people.length}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={162}
        snapToAlignment="start"
      >
        {visible.map(person => (
          <PersonCard key={person.id} person={person} />
        ))}
        {remaining > 0 && <SeeMoreCard count={remaining} />}
      </ScrollView>
    </View>
  );
}

const CARD_WIDTH = 152;

const styles = StyleSheet.create({
  section: { marginTop: 18, marginBottom: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  title: {
    fontFamily: Fonts.headingRegular,
    fontSize: 17,
    color: C.text,
    fontStyle: 'italic',
    letterSpacing: -0.2,
  },
  seeAllLink: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.primary,
    opacity: 0.85,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 4,
  },

  // Person card
  card: {
    width: CARD_WIDTH,
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.borderWarm,
    padding: 14,
    alignItems: 'center',
    shadowColor: C.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.text,
    letterSpacing: -0.1,
    textAlign: 'center',
    marginBottom: 3,
  },
  cardMeta: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    textAlign: 'center',
    marginBottom: 8,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 10,
  },
  tag: {
    backgroundColor: '#FFF0E8',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.15)',
  },
  tagText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: '#C4530A',
  },
  connectBtn: {
    marginTop: 'auto' as any,
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: C.primary,
  },
  connectText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: C.primary,
  },

  // See more card
  seeMoreCard: {
    width: CARD_WIDTH,
    backgroundColor: C.surfaceAlt,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  seeMoreIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
    shadowColor: C.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  seeMoreIconText: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    color: C.primary,
    fontStyle: 'italic',
  },
  seeMoreLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.text,
  },
  seeMoreSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
    textAlign: 'center',
  },
  seeMoreArrow: {
    marginTop: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  arrowChevron: {
    width: 7, height: 7,
    borderRightWidth: 2, borderTopWidth: 2,
    borderColor: '#fff',
    transform: [{ rotate: '45deg' }],
    marginLeft: -3,
  },
});
