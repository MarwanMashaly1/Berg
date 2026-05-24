import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { C, Fonts } from '../../../constants/theme';
import {
  apiFetch,
  getMyCircles,
  MyCircle,
  getProfileConnections,
} from '../../../lib/api';
import { Avatar } from '../../ui/Avatar';

// ─── Types ────────────────────────────────────────────────────────────────────

type Person = {
  id: string;
  name: string | null;
  username: string | null;
};

// ─── Person row ───────────────────────────────────────────────────────────────

function PersonRow({
  person,
  selected,
  onToggle,
}: {
  person: Person;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.personRow}>
      <Avatar name={person.name ?? undefined} userId={person.id} size="md" />
      <View style={styles.personInfo}>
        <Text style={styles.personName}>{person.name ?? 'Unknown'}</Text>
        {person.username && (
          <Text style={styles.personAvailability}>@{person.username}</Text>
        )}
      </View>
      <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
        {selected && <Text style={styles.checkmark}>✓</Text>}
      </View>
    </Pressable>
  );
}

// ─── Step2People ──────────────────────────────────────────────────────────────

export function Step2People({
  selectedPeople,
  onTogglePerson,
  selectedCircles,
  onToggleCircle,
  onNext,
  insetBottom,
}: {
  selectedPeople: Person[];
  onTogglePerson: (person: Person) => void;
  selectedCircles: MyCircle[];
  onToggleCircle: (circle: MyCircle) => void;
  onNext: () => void;
  insetBottom: number;
}) {
  const [tab, setTab] = useState<'people' | 'circles'>('people');
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<Person[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [myCircles, setMyCircles] = useState<MyCircle[]>([]);
  const selectedPeopleIds = selectedPeople.map(p => p.id);
  const selectedCircleIds = selectedCircles.map(c => c.id);
  const totalSelected = selectedPeople.length + selectedCircles.length;

  useEffect(() => {
    Promise.all([
      getProfileConnections().then(d => setFriends(d.confirmed.map(u => ({ id: u.id, name: u.name, username: null })))).catch(() => {}),
      getMyCircles().then(d => setMyCircles(d.joined)).catch(() => {}),
    ]).finally(() => setFriendsLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'people') return;
    const q = query.trim();
    if (q.length < 1) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiFetch<{ users: Person[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
        const friendIds = new Set(friends.map(f => f.id));
        setResults((data.users ?? []).filter(u => friendIds.has(u.id)));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, tab]);

  return (
    <View style={styles.stepRoot}>
      <Text style={styles.stepTitle}>Who&apos;s coming?</Text>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'people' && styles.tabBtnActive]} onPress={() => setTab('people')}>
          <Text style={[styles.tabBtnText, tab === 'people' && styles.tabBtnTextActive]}>People</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'circles' && styles.tabBtnActive]} onPress={() => setTab('circles')}>
          <Text style={[styles.tabBtnText, tab === 'circles' && styles.tabBtnTextActive]}>Circles</Text>
        </TouchableOpacity>
      </View>

      {/* Selected chips (people + circles combined) */}
      {totalSelected > 0 && (
        <Animated.View entering={FadeInDown.springify()}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedChipsRow}>
            {selectedPeople.map(p => (
              <View key={p.id} style={styles.selectedChip}>
                <Avatar name={p.name ?? undefined} userId={p.id} size="xs" />
                <Text style={styles.chipName}>{p.name?.split(' ')[0] ?? 'Someone'}</Text>
                <TouchableOpacity onPress={() => onTogglePerson(p)}><Text style={styles.chipRemove}>×</Text></TouchableOpacity>
              </View>
            ))}
            {selectedCircles.map(ci => (
              <View key={ci.id} style={[styles.selectedChip, { backgroundColor: ci.categoryColor }]}>
                <Text style={styles.chipEmoji}>{ci.categoryEmoji}</Text>
                <Text style={styles.chipName}>{ci.name}</Text>
                <TouchableOpacity onPress={() => onToggleCircle(ci)}><Text style={styles.chipRemove}>×</Text></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* People tab */}
      {tab === 'people' && (
        <>
          <View style={styles.searchWrapper}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search for someone on Berg…"
              placeholderTextColor={C.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {(searching || (friendsLoading && query.trim().length === 0)) && (
              <ActivityIndicator size="small" color={C.primary} style={{ marginRight: 10 }} />
            )}
          </View>
          {query.trim().length === 0 ? (
            friends.length === 0 && !friendsLoading ? (
              <View style={styles.searchHint}>
                <Text style={styles.searchHintText}>No friends yet — search above to invite someone</Text>
              </View>
            ) : (
              <FlatList
                data={friends}
                keyExtractor={p => p.id}
                renderItem={({ item }) => (
                  <PersonRow person={item} selected={selectedPeopleIds.includes(item.id)} onToggle={() => onTogglePerson(item)} />
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                style={styles.personList}
                contentContainerStyle={{ paddingBottom: insetBottom + 100 }}
                showsVerticalScrollIndicator={false}
              />
            )
          ) : results.length === 0 && !searching ? (
            <View style={styles.searchHint}><Text style={styles.searchHintText}>No users found for "{query}"</Text></View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={p => p.id}
              renderItem={({ item }) => (
                <PersonRow person={item} selected={selectedPeopleIds.includes(item.id)} onToggle={() => onTogglePerson(item)} />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              style={styles.personList}
              contentContainerStyle={{ paddingBottom: insetBottom + 100 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* Circles tab */}
      {tab === 'circles' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insetBottom + 100 }}>
          {myCircles.length === 0 ? (
            <View style={styles.searchHint}><Text style={styles.searchHintText}>You haven't joined any circles yet.</Text></View>
          ) : (
            myCircles.map(ci => {
              const selected = selectedCircleIds.includes(ci.id);
              return (
                <Pressable key={ci.id} onPress={() => onToggleCircle(ci)} style={styles.personRow}>
                  <View style={[styles.circleIconSmall, { backgroundColor: ci.categoryColor }]}>
                    <Text style={{ fontSize: 18 }}>{ci.categoryEmoji}</Text>
                  </View>
                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{ci.name}</Text>
                    <Text style={styles.personAvailability}>Invite everyone in this circle</Text>
                  </View>
                  <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      <View style={[styles.ctaContainer, { bottom: insetBottom + 20 }]}>
        <TouchableOpacity
          onPress={onNext}
          style={styles.ctaBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>
            {totalSelected > 0 ? `Next · ${totalSelected} selected` : 'Skip for now'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRoot: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: 'Fraunces_400Regular',
    fontStyle: 'italic',
    fontSize: 26,
    color: C.text,
    paddingHorizontal: 24,
    marginTop: 28,
    marginBottom: 4,
    lineHeight: 32,
  },
  // Tab switcher
  tabRow: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 8, backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: { backgroundColor: C.surface },
  tabBtnText: { fontFamily: Fonts.body, fontSize: 13, color: C.textTertiary },
  tabBtnTextActive: { fontFamily: Fonts.bodySemiBold, color: C.text },
  chipEmoji: { fontSize: 14 },
  circleIconSmall: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // People
  selectedChipsRow: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
    flexDirection: 'row',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  chipName: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.text,
  },
  chipRemove: {
    fontSize: 13,
    color: C.textTertiary,
    lineHeight: 16,
  },
  searchWrapper: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.text,
  },
  searchHint: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  searchHintText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: C.textTertiary,
    textAlign: 'center',
  },
  personList: {
    flex: 1,
    marginTop: 8,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 60,
    gap: 12,
  },
  personInfo: {
    flex: 1,
    gap: 2,
  },
  personName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: C.text,
  },
  personAvailability: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: C.textTertiary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  checkmark: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: C.textInverse,
    lineHeight: 16,
  },
  separator: {
    height: 1,
    backgroundColor: C.surfaceAlt,
    marginHorizontal: 20,
  },
  // CTA
  ctaContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  ctaBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: C.textInverse,
  },
});
