import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../../components/ui/BackButton';
import { C, Fonts } from '../../constants/theme';
import { getDiscoveryPeople, getDiscoveryCircles, PersonSuggestion, CircleSuggestion } from '../../lib/api';
import { PeopleSection } from '../../components/features/discovery/PeopleSection';
import { CirclesSection } from '../../components/features/discovery/CirclesSection';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<PersonSuggestion[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [circles, setCircles] = useState<CircleSuggestion[]>([]);
  const [circlesLoading, setCirclesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [pe, ci] = await Promise.allSettled([
      getDiscoveryPeople(),
      getDiscoveryCircles(),
    ]);
    if (pe.status === 'fulfilled') setPeople(pe.value.people);
    setPeopleLoading(false);
    if (ci.status === 'fulfilled') setCircles(ci.value.circles);
    setCirclesLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>Explore</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />
        }>
        <PeopleSection people={people} loading={peopleLoading} />
        <CirclesSection circles={circles} loading={circlesLoading} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.background,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 20,
    color: C.text,
    fontStyle: 'italic',
    letterSpacing: -0.3,
  },
});
