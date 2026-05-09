import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Modal,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Fonts } from '../../../../constants/theme';
import {
  apiFetch, getMyCircles, MyCircle,
  getProfileConnections,
  getNearbyPlaces, autocompletePlaces, getPlaceDetail, PlaceSuggestion, PlaceDetail,
} from '../../../../lib/api';
import { trackMotiveCreated, trackPlaceSelected } from '../../../../lib/analytics';
import { CATEGORY_MAP, CategoryKey, initials } from '../../../../constants/motives';
import { Avatar } from '../../../../components/ui/Avatar';
import * as Location from 'expo-location';

const C = Colors.light;
const SCREEN_WIDTH = Dimensions.get('window').width;

// ─── Category helper ──────────────────────────────────────────────────────────
type CatKey = CategoryKey;
function getCat(key: string) {
  return CATEGORY_MAP[key as CatKey] ?? { label: key, color: C.textTertiary, emoji: '•', tint: 'rgba(150,150,150,0.08)' };
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Person = {
  id: string;
  name: string | null;
  username: string | null;
};

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ step, total }: { step: number; total: number }) {
  const progress = useSharedValue((step / total) * 100);

  useEffect(() => {
    progress.value = withTiming((step / total) * 100, { duration: 300 });
  }, [step]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

// ─── Category grid constants ─────────────────────────────────────────────────
const GRID_PADDING = 20;
const GRID_GAP = 10;
// CAT_ROWS is a fixed 3×3 grid
const CAT_ROWS: CatKey[][] = [
  ['food', 'outdoors', 'catchup'],
  ['movies', 'active', 'party'],
  ['gaming', 'travel', 'creative'],
];

// ─── Category cell ────────────────────────────────────────────────────────────
function CategoryCell({
  catKey,
  selected,
  onSelect,
}: {
  catKey: CatKey;
  selected: boolean;
  onSelect: () => void;
}) {
  const cat = getCat(catKey);
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(1.05, { damping: 10, stiffness: 300 }, () => {
      scale.value = withSpring(1, { damping: 10, stiffness: 300 });
    });
    onSelect();
  };

  return (
    <Animated.View style={[styles.catCellWrap, animStyle]}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.catCell,
          {
            backgroundColor: selected ? cat.tint : C.surface,
            borderColor: selected ? cat.color : C.border,
            borderWidth: selected ? 2 : 1.5,
          },
        ]}
      >
        <Text style={styles.catEmoji}>{cat.emoji}</Text>
        <Text style={[styles.catLabel, { color: selected ? cat.color : C.textSecondary }]}>
          {cat.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

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

// ─── Bottom CTA ───────────────────────────────────────────────────────────────
function BottomCTA({
  label,
  enabled,
  onPress,
  insetBottom,
}: {
  label: string;
  enabled: boolean;
  onPress: () => void;
  insetBottom: number;
}) {
  return (
    <View style={[styles.ctaContainer, { bottom: insetBottom + 20 }]}>
      <TouchableOpacity
        onPress={enabled ? onPress : undefined}
        style={[styles.ctaBtn, !enabled && styles.ctaBtnDisabled]}
        activeOpacity={0.85}
      >
        <Text style={[styles.ctaText, !enabled && styles.ctaTextDisabled]}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 1: Category ─────────────────────────────────────────────────────────
function Step1({
  selected,
  onSelect,
  onNext,
  insetBottom,
}: {
  selected: CatKey | null;
  onSelect: (k: CatKey) => void;
  onNext: () => void;
  insetBottom: number;
}) {
  return (
    <View style={styles.stepRoot}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insetBottom + 100 }}
      >
        <Text style={styles.stepTitle}>What kind of plan?</Text>
        <Text style={styles.stepSubtitle}>Pick a vibe</Text>
        <View style={styles.catGrid}>
          {CAT_ROWS.map((row, ri) => (
            <View key={ri} style={styles.catRow}>
              {row.map(k => (
                <CategoryCell
                  key={k}
                  catKey={k}
                  selected={selected === k}
                  onSelect={() => onSelect(k)}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <BottomCTA
        label="Next"
        enabled={selected !== null}
        onPress={onNext}
        insetBottom={insetBottom}
      />
    </View>
  );
}

// ─── Step 2: People + Circles ────────────────────────────────────────────────
function Step2({
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

      <BottomCTA
        label={totalSelected > 0 ? `Next · ${totalSelected} selected` : 'Skip for now'}
        enabled={true}
        onPress={onNext}
        insetBottom={insetBottom}
      />
    </View>
  );
}

// ─── Date picker modal ────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function nextWeekday(d: Date, day: number): Date {
  const r = new Date(d);
  const diff = (day - r.getDay() + 7) % 7 || 7;
  r.setDate(r.getDate() + diff);
  return r;
}

function formatDateFull(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${h}:${m} ${ap}`;
}

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function DatePickerModal({
  visible,
  value,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  value: Date | null;
  onConfirm: (d: Date) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(value ?? addDays(now, 1));
  const [calYear, setCalYear] = useState(selectedDate.getFullYear());
  const [calMonth, setCalMonth] = useState(selectedDate.getMonth());
  const [hour, setHour] = useState(value ? (value.getHours() % 12 || 12).toString() : '7');
  const [minute, setMinute] = useState(value ? value.getMinutes().toString().padStart(2, '0') : '00');
  const [isPm, setIsPm] = useState(value ? value.getHours() >= 12 : true);

  const presets = [
    { label: 'Today',    date: now },
    { label: 'Tomorrow', date: addDays(now, 1) },
    { label: 'Sat',      date: nextWeekday(now, 6) },
    { label: '+1 week',  date: addDays(now, 7) },
  ];

  function selectPreset(d: Date) {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    setSelectedDate(r);
    setCalYear(r.getFullYear());
    setCalMonth(r.getMonth());
  }

  function selectDay(day: number) {
    const r = new Date(calYear, calMonth, day);
    setSelectedDate(r);
  }

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }

  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  function handleConfirm() {
    const result = new Date(selectedDate);
    const h = parseInt(hour, 10) || 7;
    const m = parseInt(minute, 10) || 0;
    const h24 = (h % 12) + (isPm ? 12 : 0);
    result.setHours(h24, m, 0, 0);
    onConfirm(result);
    onClose();
  }

  // Build calendar grid as rows of 7
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d);
  while (calCells.length % 7 !== 0) calCells.push(null);
  const calRows: (number | null)[][] = [];
  for (let i = 0; i < calCells.length; i += 7) calRows.push(calCells.slice(i, i + 7));

  const isSelected = (day: number) =>
    selectedDate.getDate() === day &&
    selectedDate.getMonth() === calMonth &&
    selectedDate.getFullYear() === calYear;

  const isPast = (day: number) => {
    const d = new Date(calYear, calMonth, day);
    d.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return d < t;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>

          <Text style={styles.modalTitle}>When?</Text>

          {/* Quick presets */}
          <View style={styles.presetRow}>
            {presets.map(p => {
              const active = selectedDate.toDateString() === p.date.toDateString();
              return (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => selectPreset(p.date)}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                >
                  <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Month nav */}
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
              <MaterialIcons name="chevron-left" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.calMonthLabel}>
              {MONTHS[calMonth]} {calYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
              <MaterialIcons name="chevron-right" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* Week day headers */}
          <View style={styles.calWeekRow}>
            {WEEK_DAYS.map(d => (
              <Text key={d} style={styles.calWeekDay}>{d}</Text>
            ))}
          </View>

          {/* Calendar cells — explicit rows ensure perfect column alignment */}
          <View style={styles.calGrid}>
            {calRows.map((row, ri) => (
              <View key={ri} style={styles.calRow}>
                {row.map((day, ci) => {
                  if (!day) return <View key={ci} style={styles.calDayEmpty} />;
                  const sel = isSelected(day);
                  const past = isPast(day);
                  return (
                    <TouchableOpacity
                      key={ci}
                      onPress={() => !past && selectDay(day)}
                      style={[styles.calDay, sel && styles.calDaySelected]}
                      activeOpacity={past ? 1 : 0.7}
                    >
                      <Text style={[
                        styles.calDayText,
                        sel && styles.calDayTextSelected,
                        past && styles.calDayTextPast,
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Time selector */}
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Time</Text>
            <View style={styles.timeInputs}>
              <TextInput
                style={styles.timeInput}
                value={hour}
                onChangeText={v => setHour(v.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="7"
                placeholderTextColor={C.textTertiary}
              />
              <Text style={styles.timeColon}>:</Text>
              <TextInput
                style={styles.timeInput}
                value={minute}
                onChangeText={v => setMinute(v.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="00"
                placeholderTextColor={C.textTertiary}
              />
              <TouchableOpacity onPress={() => setIsPm(!isPm)} style={styles.ampmToggle}>
                <Text style={[styles.ampmOption, !isPm && styles.ampmActive]}>AM</Text>
                <Text style={[styles.ampmOption, isPm && styles.ampmActive]}>PM</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.modalConfirm} onPress={handleConfirm} activeOpacity={0.85}>
            <Text style={styles.modalConfirmText}>
              Confirm · {selectedDate.getDate()} {MONTHS[selectedDate.getMonth()]}
            </Text>
          </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Distance formatting (client-side) ───────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// ─── PlacePicker — location search with Google Places ────────────────────────
//
// State machine:
//  idle      → no input, showing nearby suggestions (or empty if no location)
//  searching → user is typing, showing autocomplete results
//  selected  → a place has been chosen, show confirmation card
//
function PlacePicker({
  category,
  value,
  onChange,
}: {
  category: CatKey | null;
  value: PlaceDetail | null;
  onChange: (place: PlaceDetail | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null); // null = asking
  const [nearby, setNearby] = useState<PlaceSuggestion[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null); // placeId being fetched
  // Session token groups all keystrokes + 1 detail call into one $17 billing event.
  // Generated on first keystroke of each search session, reset after selection.
  const sessionTokenRef = useRef<string>('');
  function getOrCreateSessionToken(): string {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return sessionTokenRef.current;
  }

  // Request location permission and load nearby on mount.
  // getLastKnownPositionAsync is instant (cached GPS) — seeds nearby immediately.
  // getCurrentPositionAsync then refreshes with a live fix in the background.
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationGranted(granted);
      if (!granted) return;

      // Instant: use last cached position to show nearby right away
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
      if (last) {
        setUserLat(last.coords.latitude);
        setUserLng(last.coords.longitude);
      }

      // Background: freshen with a live fix (updates nearby silently if moved)
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLat(pos.coords.latitude);
      setUserLng(pos.coords.longitude);
    })();
  }, []);

  // Load nearby when location becomes available and category is known
  useEffect(() => {
    if (userLat === null || userLng === null || !category) return;
    setNearbyLoading(true);
    getNearbyPlaces(category, userLat, userLng)
      .then(({ places }) => setNearby(places))
      .catch(() => setNearby([]))
      .finally(() => setNearbyLoading(false));
  }, [userLat, userLng, category]);

  // Debounced autocomplete — fires after 350ms, minimum 2 characters
  // Uses Google Places Autocomplete API (11× cheaper than Text Search)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      setSearchLoading(true);
      autocompletePlaces(q, userLat ?? undefined, userLng ?? undefined, getOrCreateSessionToken())
        .then(({ places }) => setSearchResults(places))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query, userLat, userLng]);

  async function handleSelect(suggestion: PlaceSuggestion) {
    setSelectingId(suggestion.placeId);
    try {
      // If the suggestion already has lat/lng (nearby results), use it directly —
      // no Detail API call needed. Only autocomplete results have null lat/lng.
      if (suggestion.lat !== null && suggestion.lng !== null) {
        trackPlaceSelected({ source: 'nearby', category: category ?? '' });
        onChange({
          placeId: suggestion.placeId,
          name: suggestion.name,
          address: suggestion.address ?? '',
          lat: suggestion.lat,
          lng: suggestion.lng,
          rating: suggestion.rating ?? null,
        });
      } else {
        // Autocomplete selection — fetch Detail to get coordinates.
        // Passing sessionToken closes the billing session (one flat fee covers all prior keystrokes).
        const token = sessionTokenRef.current;
        sessionTokenRef.current = ''; // reset so next search gets a new token
        const detail = await getPlaceDetail(suggestion.placeId, token || undefined);
        trackPlaceSelected({ source: 'search', category: category ?? '' });
        onChange(detail);
      }
      setQuery('');
      setSearchResults([]);
    } catch {
      // Fallback: use what we have, lat/lng will be 0 (stored but not critical)
      onChange({
        placeId: suggestion.placeId,
        name: suggestion.name,
        address: suggestion.address ?? '',
        lat: suggestion.lat ?? 0,
        lng: suggestion.lng ?? 0,
        rating: suggestion.rating ?? null,
      });
      setQuery('');
    } finally {
      setSelectingId(null);
    }
  }

  function handleClear() {
    onChange(null);
    setQuery('');
    setSearchResults([]);
  }

  // ── Selected state — show place card ──
  if (value) {
    const selectedDist =
      userLat !== null && userLng !== null && value.lat && value.lng
        ? formatDist(haversineKm(userLat, userLng, value.lat, value.lng))
        : null;

    return (
      <View style={ppStyles.selectedCard}>
        <View style={ppStyles.selectedInfo}>
          <Text style={ppStyles.selectedName} numberOfLines={1}>{value.name}</Text>
          {value.address ? (
            <Text style={ppStyles.selectedAddr} numberOfLines={1}>{value.address}</Text>
          ) : null}
          <View style={ppStyles.selectedMeta}>
            {value.rating ? (
              <View style={ppStyles.ratingRow}>
                <Text style={ppStyles.ratingStars}>{'★'.repeat(Math.round(value.rating))}{'☆'.repeat(5 - Math.round(value.rating))}</Text>
                <Text style={ppStyles.ratingNum}>{value.rating.toFixed(1)}</Text>
              </View>
            ) : null}
            {selectedDist && (
              <Text style={ppStyles.selectedDistText}>{selectedDist} away</Text>
            )}
          </View>
        </View>
        <View style={ppStyles.checkBadge}>
          <View style={ppStyles.checkmark} />
        </View>
        <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={ppStyles.clearX} />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Searching / idle state ──
  const showResults = query.trim().length > 0;
  const listToShow = showResults ? searchResults : nearby;
  const isLoading = showResults ? searchLoading : nearbyLoading;

  const cat = category ? getCat(category) : null;
  const sectionLabel = showResults
    ? 'SEARCH RESULTS'
    : locationGranted && cat
      ? `${cat.label.toUpperCase()} NEAR YOU`
      : 'SEARCH A PLACE';

  return (
    <View>
      {/* Search input */}
      <View style={ppStyles.searchBox}>
        {/* Magnifier icon */}
        <View style={ppStyles.searchIconWrap}>
          <View style={ppStyles.searchCircle} />
          <View style={ppStyles.searchHandle} />
        </View>
        <TextInput
          style={ppStyles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={
            locationGranted === false
              ? 'Search for a place…'
              : cat
                ? `Search ${cat.label.toLowerCase()} venues…`
                : 'Search a place…'
          }
          placeholderTextColor={C.textTertiary}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={ppStyles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Location denied hint */}
      {locationGranted === false && !showResults && (
        <Text style={ppStyles.noLocHint}>
          Enable location for nearby suggestions, or type to search.
        </Text>
      )}

      {/* Suggestions / results */}
      {(isLoading) ? (
        <ActivityIndicator color={C.primary} size="small" style={{ marginTop: 14 }} />
      ) : listToShow.length > 0 ? (
        <View style={ppStyles.listWrap}>
          <Text style={ppStyles.listLabel}>{sectionLabel}</Text>
          {listToShow.map((place) => (
            <TouchableOpacity
              key={place.placeId}
              style={ppStyles.placeRow}
              onPress={() => handleSelect(place)}
              disabled={selectingId === place.placeId}
              activeOpacity={0.75}
            >
              {/* Category color circle */}
              <View style={[ppStyles.placeIcon, { backgroundColor: cat?.tint ?? C.surfaceAlt }]}>
                <Text style={{ fontSize: 16 }}>{cat?.emoji ?? '📍'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ppStyles.placeName} numberOfLines={1}>{place.name}</Text>
                <Text style={ppStyles.placeAddr} numberOfLines={1}>{place.address}</Text>
              </View>
              <View style={ppStyles.placeMeta}>
                {place.distanceKm != null && (
                  <Text style={ppStyles.placeDist}>{formatDist(place.distanceKm)}</Text>
                )}
                {place.isOpen != null && (
                  <Text style={[ppStyles.placeOpen, !place.isOpen && ppStyles.placeClosed]}>
                    {place.isOpen ? 'Open' : 'Closed'}
                  </Text>
                )}
              </View>
              {selectingId === place.placeId && (
                <ActivityIndicator size="small" color={C.primary} style={{ marginLeft: 6 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : showResults && !searchLoading ? (
        <Text style={ppStyles.noResults}>No places found — try a different search</Text>
      ) : null}
    </View>
  );
}

const ppStyles = StyleSheet.create({
  // Search input
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 4,
  },
  searchIconWrap: { width: 15, height: 15, position: 'relative', flexShrink: 0 },
  searchCircle: {
    width: 11, height: 11, borderRadius: 6,
    borderWidth: 2, borderColor: C.textTertiary,
    position: 'absolute', top: 0, left: 0,
  },
  searchHandle: {
    width: 5, height: 2, backgroundColor: C.textTertiary,
    borderRadius: 1, position: 'absolute', bottom: 0, right: 0,
    transform: [{ rotate: '-45deg' }],
  },
  searchInput: {
    flex: 1, fontFamily: Fonts.body,
    fontSize: 13, color: C.text, padding: 0,
  },
  clearText: { fontFamily: Fonts.body, fontSize: 13, color: C.textTertiary },
  noLocHint: {
    fontFamily: Fonts.body, fontSize: 12,
    color: C.textTertiary, marginTop: 6, marginBottom: 4,
  },
  // Suggestions list
  listWrap: { marginTop: 8 },
  listLabel: {
    fontFamily: Fonts.bodySemiBold, fontSize: 11,
    color: C.textTertiary, letterSpacing: 0.6,
    marginBottom: 6, marginLeft: 2,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  placeIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  placeName: {
    fontFamily: Fonts.bodySemiBold, fontSize: 13,
    color: C.text, marginBottom: 2,
  },
  placeAddr: { fontFamily: Fonts.body, fontSize: 11, color: C.textSecondary },
  placeMeta: { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  placeDist: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary },
  placeOpen: {
    fontFamily: Fonts.bodySemiBold, fontSize: 10,
    color: '#2D6A4F',
    backgroundColor: 'rgba(45,106,79,0.1)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  placeClosed: {
    color: '#C53030', backgroundColor: 'rgba(197,48,48,0.08)',
  },
  noResults: {
    fontFamily: Fonts.body, fontSize: 13,
    color: C.textTertiary, textAlign: 'center', marginTop: 16,
  },
  // Selected card
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2D6A4F',
    padding: 13,
    shadowColor: '#2D6A4F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  selectedInfo: { flex: 1 },
  selectedName: {
    fontFamily: Fonts.bodySemiBold, fontSize: 13,
    color: C.text, marginBottom: 2,
  },
  selectedAddr: { fontFamily: Fonts.body, fontSize: 11, color: C.textSecondary },
  selectedMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
  selectedDistText: { fontFamily: Fonts.body, fontSize: 11, color: C.primary },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingStars: { fontSize: 11, color: '#F5A623', letterSpacing: 1 },
  ratingNum: { fontFamily: Fonts.body, fontSize: 11, color: C.textTertiary },
  // Green check badge
  checkBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#2D6A4F',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: {
    width: 6, height: 10,
    borderRightWidth: 2, borderBottomWidth: 2,
    borderColor: '#fff',
    transform: [{ rotate: '45deg' }, { translateY: -1 }],
  },
  // × to deselect
  clearX: {
    width: 14, height: 14,
    backgroundColor: C.textTertiary,
    borderRadius: 7,
    opacity: 0.5,
  },
});

// ─── Step 3: Details ──────────────────────────────────────────────────────────
function Step3({
  category,
  selectedPeopleNames,
  title,
  setTitle,
  date,
  setDate,
  selectedPlace,
  setSelectedPlace,
  note,
  setNote,
  onNext,
  insetBottom,
}: {
  category: CatKey | null;
  selectedPeopleNames: string[];
  title: string;
  setTitle: (v: string) => void;
  date: Date | null;
  setDate: (d: Date | null) => void;
  selectedPlace: PlaceDetail | null;
  setSelectedPlace: (p: PlaceDetail | null) => void;
  note: string;
  setNote: (v: string) => void;
  onNext: () => void;
  insetBottom: number;
}) {
  const [showDateModal, setShowDateModal] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const cat = category ? getCat(category) : null;

  // Auto-update title when a place is selected and title is still default/empty
  function handlePlaceSelect(place: PlaceDetail | null) {
    setSelectedPlace(place);
    if (place && !title.trim()) {
      // e.g. "Drinks at The Ivy"
      const verb = cat?.label ?? 'Meetup';
      setTitle(`${verb} at ${place.name}`);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.stepRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insetBottom + 100 }}
      >
        <Text style={styles.stepTitle}>Set the details</Text>

        {/* Title field */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>NAME YOUR PLAN</Text>
          <TextInput
            style={styles.fieldInput}
            value={title}
            onChangeText={setTitle}
            placeholder={
              cat && selectedPeopleNames.length > 0
                ? `${cat.label} with ${selectedPeopleNames[0]}`
                : 'Give your plan a name'
            }
            placeholderTextColor={C.textTertiary}
          />
        </View>

        {/* Date & time field */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>WHEN</Text>
          <Pressable
            onPress={() => setShowDateModal(true)}
            style={styles.fieldInputRow}
          >
            <Text style={[styles.fieldInputText, !date && styles.fieldPlaceholder]}>
              {date ? formatDateFull(date) : 'Pick a date and time'}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={C.textTertiary} />
          </Pressable>
        </View>

        {/* Place picker — Google Places with contextual suggestions */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>WHERE (OPTIONAL)</Text>
          <PlacePicker
            category={category}
            value={selectedPlace}
            onChange={handlePlaceSelect}
          />
        </View>

        {/* Note field */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldMultiline]}
            value={note}
            onChangeText={v => setNote(v.slice(0, 200))}
            placeholder="Add a note for your friends…"
            placeholderTextColor={C.textTertiary}
            multiline
            numberOfLines={4}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            textAlignVertical="top"
          />
          {noteFocused && (
            <Text style={styles.charCount}>{note.length}/200</Text>
          )}
        </View>
      </ScrollView>

      <BottomCTA
        label="Next"
        enabled={true}
        onPress={onNext}
        insetBottom={insetBottom}
      />

      <DatePickerModal
        visible={showDateModal}
        value={date}
        onConfirm={setDate}
        onClose={() => setShowDateModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────
function Step4({
  category,
  title,
  date,
  selectedPlace,
  selectedPeople,
  onSubmit,
  onDraft,
  submitting,
  error,
  insetBottom,
}: {
  category: CatKey | null;
  title: string;
  date: Date | null;
  selectedPlace: PlaceDetail | null;
  selectedPeople: Person[];
  onSubmit: () => void;
  onDraft: () => void;
  submitting: boolean;
  error: string | null;
  insetBottom: number;
}) {
  const cat = category ? getCat(category) : null;

  return (
    <ScrollView
      style={styles.stepRoot}
      contentContainerStyle={{ paddingBottom: insetBottom + 120 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.stepTitle, { marginBottom: 24 }]}>Review</Text>

      {/* Preview card */}
      <View style={styles.reviewCard}>
        {cat && <View style={[styles.reviewCardAccent, { backgroundColor: cat.color }]} />}
        <View style={styles.reviewCardContent}>
          {cat && (
            <Text style={[styles.reviewCatLabel, { color: cat.color }]}>
              {cat.label.toUpperCase()}
            </Text>
          )}
          <Text style={styles.reviewTitle}>{title}</Text>
          <Text style={styles.reviewDate}>{date ? formatDateFull(date) : 'Date TBD'}</Text>
          {selectedPlace && (
            <Text style={styles.reviewAddress}>{selectedPlace.name}</Text>
          )}
          {selectedPlace?.address ? (
            <Text style={[styles.reviewAddress, { fontSize: 11, opacity: 0.7 }]}>{selectedPlace.address}</Text>
          ) : null}
          {selectedPeople.length > 0 && (
            <>
              <View style={styles.reviewAvatarRow}>
                {selectedPeople.slice(0, 5).map((p, i) => (
                  <Avatar
                    key={p.id}
                    name={p.name ?? undefined}
                    userId={p.id}
                    size="xs"
                    style={[styles.reviewAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }]}
                  />
                ))}
              </View>
              <Text style={styles.reviewNames}>
                {selectedPeople.slice(0, 3).map(p => p.name?.split(' ')[0]).join(', ')}
                {selectedPeople.length > 3 ? ` +${selectedPeople.length - 3}` : ''}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Inline error */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="info-outline" size={16} color="#C84B4B" />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* Actions */}
      <TouchableOpacity
        onPress={onSubmit}
        style={[styles.reviewPrimary, { marginTop: error ? 12 : 24 }, submitting && { opacity: 0.7 }]}
        activeOpacity={0.85}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.reviewPrimaryText}>Send invites</Text>
        }
      </TouchableOpacity>
      <TouchableOpacity onPress={onDraft} style={styles.reviewDraft} disabled={submitting}>
        <Text style={styles.reviewDraftText}>Save as draft</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Main create screen ───────────────────────────────────────────────────────
export default function CreateMotiveScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ prefillUsers?: string }>();
  const [step, setStep] = useState(1);
  const TOTAL = 4;

  // Step 1
  const [category, setCategory] = useState<CatKey | null>(null);
  // Step 2
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [selectedCircles, setSelectedCircles] = useState<MyCircle[]>([]);
  const selectedIds = selectedPeople.map(p => p.id);

  // Pre-fill from prompt CTA
  useEffect(() => {
    if (params.prefillUsers) {
      try {
        const users = JSON.parse(params.prefillUsers) as Person[];
        if (Array.isArray(users) && users.length > 0) {
          setSelectedPeople(users);
          setStep(3); // Skip to details — people already chosen
        }
      } catch {}
    }
  }, []);
  // Step 3
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetail | null>(null);
  const [note, setNote] = useState('');
  // Step 4
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const togglePerson = useCallback((person: Person) => {
    setSelectedPeople(prev =>
      prev.some(p => p.id === person.id)
        ? prev.filter(p => p.id !== person.id)
        : [...prev, person]
    );
  }, []);

  const toggleCircle = useCallback((circle: MyCircle) => {
    setSelectedCircles(prev =>
      prev.some(c => c.id === circle.id)
        ? prev.filter(c => c.id !== circle.id)
        : [...prev, circle]
    );
  }, []);

  function getAutoTitle(): string {
    if (!category) return 'New plan';
    const cat = getCat(category);
    const firstName = selectedPeople[0]?.name?.split(' ')[0];
    return firstName ? `${cat.label} with ${firstName}` : `${cat.label} plan`;
  }

  const resolvedTitle = title.trim() || getAutoTitle();

  const handleSubmit = async (isDraft = false) => {
    setSubmitError(null);

    if (!isDraft) {
      if (selectedIds.length === 0) {
        setSubmitError('Add at least one person before sending invites.');
        return;
      }
      if (!date) {
        setSubmitError('Pick a date and time so your friends know when to show up.');
        return;
      }
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/motives', {
        method: 'POST',
        body: JSON.stringify({
          category,
          title: resolvedTitle,
          scheduledAt: date?.toISOString() ?? null,
          placeName: selectedPlace?.name ?? null,
          placeAddress: selectedPlace?.address ?? null,
          placeId: selectedPlace?.placeId ?? null,
          lat: selectedPlace?.lat ?? null,
          lng: selectedPlace?.lng ?? null,
          note: note || null,
          invitedUserIds: selectedIds,
          invitedCircleIds: selectedCircles.map(c => c.id),
          status: isDraft ? 'planning' : 'confirmed',
        }),
      });
      trackMotiveCreated({
        category: category ?? '',
        invitee_count: selectedIds.length,
        has_place: !!selectedPlace,
        has_date: !!date,
        status: isDraft ? 'planning' : 'confirmed',
      });
      router.replace('/(app)/(tabs)/motives');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => (step > 1 ? setStep(s => s - 1) : router.back())} style={styles.navBack}>
          <Text style={styles.navBackChevron}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.navStep}>Step {step} of {TOTAL}</Text>
        <View style={styles.navRight} />
      </View>

      {/* Progress bar */}
      <ProgressBar step={step} total={TOTAL} />

      {/* Step content */}
      {step === 1 && (
        <Step1
          selected={category}
          onSelect={setCategory}
          onNext={() => setStep(2)}
          insetBottom={insets.bottom}
        />
      )}
      {step === 2 && (
        <Step2
          selectedPeople={selectedPeople}
          onTogglePerson={togglePerson}
          selectedCircles={selectedCircles}
          onToggleCircle={toggleCircle}
          onNext={() => setStep(3)}
          insetBottom={insets.bottom}
        />
      )}
      {step === 3 && (
        <Step3
          category={category}
          selectedPeopleNames={selectedPeople.map(p => p.name?.split(' ')[0] ?? '').filter(Boolean)}
          title={title}
          setTitle={setTitle}
          date={date}
          setDate={setDate}
          selectedPlace={selectedPlace}
          setSelectedPlace={setSelectedPlace}
          note={note}
          setNote={setNote}
          onNext={() => setStep(4)}
          insetBottom={insets.bottom}
        />
      )}
      {step === 4 && (
        <Step4
          category={category}
          title={resolvedTitle}
          date={date}
          selectedPlace={selectedPlace}
          selectedPeople={selectedPeople}
          onSubmit={() => handleSubmit(false)}
          onDraft={() => handleSubmit(true)}
          submitting={submitting}
          error={submitError}
          insetBottom={insets.bottom}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.surface,
  },
  // Nav
  navBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  navBack: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBackChevron: {
    fontSize: 18,
    color: C.text,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 22,
  },
  navStep: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: C.textTertiary,
  },
  navRight: {
    width: 34,
  },
  // Progress
  progressTrack: {
    height: 2,
    backgroundColor: C.border,
    width: '100%',
  },
  progressFill: {
    height: 2,
    backgroundColor: C.primary,
  },
  // Step shell
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
  stepSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: C.textTertiary,
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  // Category grid
  catGrid: {
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  catRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  catCellWrap: {
    flex: 1,
    aspectRatio: 1,
  },
  catCell: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  catEmoji: {
    fontSize: 28,
  },
  catLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 14,
  },
  // Tab switcher
  tabRow: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 8, backgroundColor: C.surfaceAlt, borderRadius: 12, padding: 3 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: { backgroundColor: C.surface },
  tabBtnText: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: C.textTertiary },
  tabBtnTextActive: { fontFamily: 'DMSans_600SemiBold', color: C.text },
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
  chipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAvatarText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    color: C.textInverse,
  },
  chipName: {
    fontFamily: 'DMSans_400Regular',
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
    fontFamily: 'DMSans_400Regular',
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
    fontFamily: 'DMSans_400Regular',
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
  personAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    color: C.textInverse,
  },
  personInfo: {
    flex: 1,
    gap: 2,
  },
  personName: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    color: C.text,
  },
  personAvailability: {
    fontFamily: 'DMSans_400Regular',
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
    fontFamily: 'DMSans_600SemiBold',
    color: C.textInverse,
    lineHeight: 16,
  },
  separator: {
    height: 1,
    backgroundColor: C.surfaceAlt,
    marginHorizontal: 20,
  },
  // Fields
  fieldWrapper: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  fieldLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    color: C.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: C.text,
  },
  fieldMultiline: {
    height: 96,
    paddingTop: 12,
    paddingBottom: 12,
  },
  fieldInputRow: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldInputText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: C.text,
    flex: 1,
  },
  fieldPlaceholder: {
    color: C.textTertiary,
  },
  charCount: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: C.textTertiary,
    textAlign: 'right',
    marginTop: 4,
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
  ctaBtnDisabled: {
    backgroundColor: C.border,
  },
  ctaText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: C.textInverse,
  },
  ctaTextDisabled: {
    color: C.textTertiary,
  },
  // Review card
  reviewCard: {
    backgroundColor: '#181614',
    borderRadius: 18,
    marginHorizontal: 20,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  reviewCardAccent: {
    width: 4,
  },
  reviewCardContent: {
    flex: 1,
    paddingLeft: 24,
    paddingRight: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  reviewCatLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  reviewTitle: {
    fontFamily: 'Fraunces_400Regular',
    fontStyle: 'italic',
    fontSize: 22,
    color: C.textInverse,
    marginTop: 8,
    lineHeight: 28,
  },
  reviewDate: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
  },
  reviewAddress: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 3,
  },
  reviewAvatarRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  reviewAvatar: {
    borderWidth: 1.5,
    borderColor: C.text,
  },
  reviewAvatarText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    color: C.textInverse,
  },
  reviewNames: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(200,75,75,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,75,75,0.25)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginTop: 20,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: '#C84B4B',
    lineHeight: 18,
  },
  reviewPrimary: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
  },
  reviewPrimaryText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: C.textInverse,
  },
  reviewDraft: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  reviewDraftText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: C.textTertiary,
  },
  // Date picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    maxHeight: '92%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'Fraunces_400Regular',
    fontStyle: 'italic',
    fontSize: 22,
    color: C.text,
    marginBottom: 20,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  presetChipActive: {
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderColor: C.primary,
  },
  presetChipText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: C.textSecondary,
  },
  presetChipTextActive: {
    color: C.primary,
    fontFamily: 'DMSans_600SemiBold',
  },
  // Calendar
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calNavBtn: {
    padding: 4,
  },
  calMonthLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: C.text,
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  calWeekDay: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
    color: C.textTertiary,
    paddingVertical: 6,
  },
  calGrid: {
    marginBottom: 16,
  },
  calRow: {
    flexDirection: 'row',
  },
  calDay: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
  },
  calDayEmpty: {
    flex: 1,
    aspectRatio: 1,
  },
  calDaySelected: {
    backgroundColor: C.primary,
  },
  calDayText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: C.text,
  },
  calDayTextSelected: {
    color: C.textInverse,
    fontFamily: 'DMSans_600SemiBold',
  },
  calDayTextPast: {
    color: C.textTertiary,
    opacity: 0.4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  timeLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 13,
    color: C.textSecondary,
  },
  timeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    width: 52,
    height: 44,
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
    textAlign: 'center',
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 18,
    color: C.text,
  },
  timeColon: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 20,
    color: C.textSecondary,
  },
  ampmToggle: {
    backgroundColor: C.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 6,
  },
  ampmOption: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: C.textTertiary,
  },
  ampmActive: {
    fontFamily: 'DMSans_600SemiBold',
    color: C.primary,
  },
  modalConfirm: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
    color: C.textInverse,
  },
});
