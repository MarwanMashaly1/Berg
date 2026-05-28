import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  FlatList,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '../../../../../constants/theme';
import { apiFetch, getProfileConnections } from '../../../../../lib/api';

// ─── Avatar helpers ───────────────────────────────────────────────────────────
const AVATAR_PRESETS: [string, string][] = [
  ['#FF9060', '#FF6B35'], ['#4CAF81', '#2D6A4F'], ['#64B4FF', '#3A7FD4'],
  ['#C08FFF', '#8B5CF6'], ['#FFD580', '#F5A623'], ['#48D8CC', '#2EC4B6'],
];
function avatarGrad(id: string): [string, string] {
  const i = Math.abs(id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 6;
  return AVATAR_PRESETS[i];
}
function initials(name: string | null): string {
  if (!name) return '?';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0][0].toUpperCase();
}

// ─── Date picker ─────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const WEEK_DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function nextWeekday(d: Date, day: number): Date {
  const r = new Date(d); const diff = (day - r.getDay() + 7) % 7 || 7; r.setDate(r.getDate() + diff); return r;
}
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function formatDateFull(d: Date): string {
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${h}:${m} ${ap}`;
}

function DatePickerModal({ visible, value, onConfirm, onClose }: {
  visible: boolean; value: Date | null; onConfirm: (d: Date) => void; onClose: () => void;
}) {
  const now = new Date();
  const [sel, setSel] = useState<Date>(value ?? addDays(now, 1));
  const [calY, setCalY] = useState(sel.getFullYear());
  const [calM, setCalM] = useState(sel.getMonth());
  const [hour, setHour] = useState(value ? (value.getHours() % 12 || 12).toString() : '7');
  const [minute, setMinute] = useState(value ? value.getMinutes().toString().padStart(2, '0') : '00');
  const [isPm, setIsPm] = useState(value ? value.getHours() >= 12 : true);

  useEffect(() => {
    if (visible && value) {
      setSel(value); setCalY(value.getFullYear()); setCalM(value.getMonth());
      setHour((value.getHours() % 12 || 12).toString());
      setMinute(value.getMinutes().toString().padStart(2, '0'));
      setIsPm(value.getHours() >= 12);
    }
  }, [visible]);

  if (!visible) return null;

  const presets = [
    { label: 'Today', date: now },
    { label: 'Tomorrow', date: addDays(now, 1) },
    { label: 'Sat', date: nextWeekday(now, 6) },
    { label: '+1 week', date: addDays(now, 7) },
  ];
  const daysInMonth = getDaysInMonth(calY, calM);
  const firstDay = getFirstDayOfMonth(calY, calM);
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayD = now.getDate(); const todayM = now.getMonth(); const todayY = now.getFullYear();

  function confirm() {
    const h = parseInt(hour, 10) || 7;
    const m = parseInt(minute, 10) || 0;
    const h24 = isPm ? (h % 12) + 12 : h % 12;
    const result = new Date(sel);
    result.setHours(h24, m, 0, 0);
    onConfirm(result);
    onClose();
  }

  return (
    <View style={dp.overlay}>
      <View style={dp.sheet}>
        <View style={dp.header}>
          <TouchableOpacity onPress={onClose}><Text style={dp.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={dp.heading}>Pick a date</Text>
          <TouchableOpacity onPress={confirm}><Text style={dp.done}>Done</Text></TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dp.presetRow}>
            {presets.map(pr => (
              <TouchableOpacity key={pr.label} onPress={() => { setSel(pr.date); setCalY(pr.date.getFullYear()); setCalM(pr.date.getMonth()); }} style={dp.presetChip}>
                <Text style={dp.presetLabel}>{pr.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={dp.monthNav}>
            <TouchableOpacity onPress={() => { const d = new Date(calY, calM - 1, 1); setCalY(d.getFullYear()); setCalM(d.getMonth()); }}>
              <Text style={dp.monthArrow}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={dp.monthLabel}>{MONTHS[calM]} {calY}</Text>
            <TouchableOpacity onPress={() => { const d = new Date(calY, calM + 1, 1); setCalY(d.getFullYear()); setCalM(d.getMonth()); }}>
              <Text style={dp.monthArrow}>{'>'}</Text>
            </TouchableOpacity>
          </View>
          <View style={dp.weekRow}>{WEEK_DAYS.map(d => <Text key={d} style={dp.weekDay}>{d}</Text>)}</View>
          <View style={dp.calGrid}>
            {cells.map((day, i) => {
              if (!day) return <View key={`e${i}`} style={dp.calCell} />;
              const isPast = calY < todayY || (calY === todayY && calM < todayM) || (calY === todayY && calM === todayM && day < todayD);
              const isSelected = sel.getFullYear() === calY && sel.getMonth() === calM && sel.getDate() === day;
              return (
                <TouchableOpacity key={day} style={[dp.calCell, isSelected && dp.calCellSelected]} onPress={() => !isPast && setSel(new Date(calY, calM, day))} disabled={isPast}>
                  <Text style={[dp.calDayText, isPast && dp.calDayPast, isSelected && dp.calDaySelectedText]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={dp.timeRow}>
            <TextInput style={dp.timeInput} value={hour} onChangeText={setHour} keyboardType="number-pad" maxLength={2} />
            <Text style={dp.timeSep}>:</Text>
            <TextInput style={dp.timeInput} value={minute} onChangeText={setMinute} keyboardType="number-pad" maxLength={2} />
            <TouchableOpacity style={[dp.amPmBtn, !isPm && dp.amPmActive]} onPress={() => setIsPm(false)}>
              <Text style={[dp.amPmText, !isPm && dp.amPmActiveText]}>AM</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[dp.amPmBtn, isPm && dp.amPmActive]} onPress={() => setIsPm(true)}>
              <Text style={[dp.amPmText, isPm && dp.amPmActiveText]}>PM</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Person row (invite picker) ───────────────────────────────────────────────
type Person = { id: string; name: string | null; username: string | null };

function PersonRow({ person, selected, alreadyInvited, onToggle }: {
  person: Person; selected: boolean; alreadyInvited: boolean; onToggle: () => void;
}) {
  const [c1, c2] = avatarGrad(person.id);
  return (
    <TouchableOpacity
      style={[styles.personRow, alreadyInvited && styles.personRowDim]}
      onPress={alreadyInvited ? undefined : onToggle}
      activeOpacity={alreadyInvited ? 1 : 0.7}
    >
      <LinearGradient colors={[c1, c2]} style={styles.personAvatar}>
        <Text style={styles.personInitials}>{initials(person.name)}</Text>
      </LinearGradient>
      <View style={styles.personInfo}>
        <Text style={styles.personName}>{person.name ?? person.username ?? 'Unknown'}</Text>
        {alreadyInvited && <Text style={styles.alreadyText}>Already invited</Text>}
      </View>
      {alreadyInvited ? (
        <MaterialIcons name="check-circle" size={20} color="#4CAF81" />
      ) : (
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <MaterialIcons name="check" size={13} color="#fff" />}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function EditMotiveScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDateModal, setShowDateModal] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [note, setNote] = useState('');

  // Invite section
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [connections, setConnections] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [newInvites, setNewInvites] = useState<Person[]>([]);

  // Load motive + connections in parallel
  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetch<{ motive: any; attendees: any[] }>(`/api/motives/${id}`),
      getProfileConnections(),
    ]).then(([motiveData, connData]) => {
      const m = motiveData.motive;
      setTitle(m.title ?? '');
      setDate(m.scheduledAt ? new Date(m.scheduledAt) : null);
      setPlaceName(m.venueName ?? '');
      setNote(m.note ?? '');
      setExistingIds(new Set((motiveData.attendees ?? []).map((a: any) => a.userId)));
      setConnections(connData.confirmed.map(c => ({ id: c.id, name: c.name, username: null })));
    })
    .catch(() => setError('Failed to load motive'))
    .finally(() => setLoading(false));
  }, [id]);

  // Live search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiFetch<{ users: Person[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
        setSearchResults(data.users ?? []);
      } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleInvite = useCallback((person: Person) => {
    setNewInvites(prev =>
      prev.some(p => p.id === person.id)
        ? prev.filter(p => p.id !== person.id)
        : [...prev, person],
    );
  }, []);

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      // Update motive details
      await apiFetch(`/api/motives/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim() || undefined,
          scheduledAt: date?.toISOString(),
          placeName: placeName.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });

      // Send new invites if any
      if (newInvites.length > 0) {
        await apiFetch(`/api/motives/${id}/invite`, {
          method: 'POST',
          body: JSON.stringify({ userIds: newInvites.map(p => p.id) }),
        });
      }

      router.back();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  const displayList = searchQuery.trim().length > 0 ? searchResults : connections;

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backChevron}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Motive</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
      >
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Title */}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>PLAN NAME</Text>
          <TextInput
            style={styles.fieldInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Name your plan"
            placeholderTextColor={C.textTertiary}
          />
        </View>

        {/* When */}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>WHEN</Text>
          <Pressable onPress={() => setShowDateModal(true)} style={styles.fieldInputRow}>
            <Text style={[styles.fieldInputText, !date && styles.placeholder]}>
              {date ? formatDateFull(date) : 'Pick a date and time'}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={C.textTertiary} />
          </Pressable>
        </View>

        {/* Where */}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>WHERE (OPTIONAL)</Text>
          <TextInput
            style={styles.fieldInput}
            value={placeName}
            onChangeText={setPlaceName}
            placeholder="e.g. Hyde Park, The Ivy, home…"
            placeholderTextColor={C.textTertiary}
            returnKeyType="done"
          />
        </View>

        {/* Note */}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={[styles.fieldInput, styles.multiline]}
            value={note}
            onChangeText={v => setNote(v.slice(0, 200))}
            placeholder="Add a note for your friends…"
            placeholderTextColor={C.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{note.length}/200</Text>
        </View>

        {/* ── Invite section ─────────────────────────────────────────── */}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>INVITE MORE PEOPLE</Text>

          {/* New invite chips */}
          {newInvites.length > 0 && (
            <View style={styles.chips}>
              {newInvites.map(p => (
                <TouchableOpacity key={p.id} style={styles.chip} onPress={() => toggleInvite(p)}>
                  <Text style={styles.chipText}>{p.name?.split(' ')[0] ?? p.username}</Text>
                  <MaterialIcons name="close" size={11} color={C.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Search bar */}
          <View style={styles.searchBar}>
            <MaterialIcons name="search" size={16} color={C.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search people…"
              placeholderTextColor={C.textTertiary}
            />
            {searching && <ActivityIndicator size="small" color={C.primary} />}
          </View>

          {/* Section label */}
          {searchQuery.trim().length === 0 && (
            <Text style={styles.sectionHint}>
              {connections.length > 0 ? 'YOUR CONNECTIONS' : ''}
            </Text>
          )}

          {/* People list */}
          {displayList.length === 0 && searchQuery.trim().length > 0 && !searching ? (
            <Text style={styles.noResults}>No people found</Text>
          ) : displayList.length === 0 && searchQuery.trim().length === 0 ? (
            <Text style={styles.noResults}>Connect with people in Discovery first</Text>
          ) : (
            <View style={styles.peopleList}>
              {displayList.map(person => (
                <PersonRow
                  key={person.id}
                  person={person}
                  selected={newInvites.some(p => p.id === person.id)}
                  alreadyInvited={existingIds.has(person.id)}
                  onToggle={() => toggleInvite(person)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <DatePickerModal
        visible={showDateModal}
        value={date}
        onConfirm={setDate}
        onClose={() => setShowDateModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  backChevron: { fontSize: 16, color: C.text, fontFamily: 'DMSans_400Regular', lineHeight: 20 },
  headerTitle: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: C.text },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.primary, borderRadius: 10 },
  saveBtnText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: '#FFF' },
  errorBanner: { backgroundColor: 'rgba(230,57,70,0.08)', borderRadius: 10, padding: 12, marginTop: 16, borderWidth: 1, borderColor: 'rgba(230,57,70,0.2)' },
  errorText: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: '#E63946' },
  fieldBlock: { marginTop: 24 },
  fieldLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 10, color: C.textTertiary, letterSpacing: 0.8, marginBottom: 8 },
  fieldInput: { backgroundColor: C.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'DMSans_400Regular', fontSize: 15, color: C.text },
  fieldInputRow: { backgroundColor: C.surfaceAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldInputText: { fontFamily: 'DMSans_400Regular', fontSize: 15, color: C.text },
  placeholder: { color: C.textTertiary },
  multiline: { minHeight: 90, paddingTop: 12 },
  charCount: { fontFamily: 'DMSans_400Regular', fontSize: 11, color: C.textTertiary, textAlign: 'right', marginTop: 4 },

  // Invite section
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,107,53,0.1)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: C.primary },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  searchInput: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 14, color: C.text },
  sectionHint: { fontFamily: 'DMSans_600SemiBold', fontSize: 10, color: C.textTertiary, letterSpacing: 0.6, marginTop: 12, marginBottom: 2 },
  peopleList: { marginTop: 4, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border },
  personRowDim: { opacity: 0.55 },
  personAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  personInitials: { fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: '#fff' },
  personInfo: { flex: 1 },
  personName: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: C.text },
  alreadyText: { fontFamily: 'DMSans_400Regular', fontSize: 11, color: C.textTertiary, marginTop: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: C.primary, borderColor: C.primary },
  noResults: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: C.textTertiary, textAlign: 'center', marginTop: 16 },
});

// ─── Date picker styles ───────────────────────────────────────────────────────
const dp = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 100 },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  heading: { fontFamily: 'DMSans_600SemiBold', fontSize: 15, color: '#1A1A1A' },
  cancel: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: '#999' },
  done: { fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: '#FF6B35' },
  presetRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  presetChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F5F5F5', borderRadius: 20 },
  presetLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: '#333' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  monthLabel: { fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: '#1A1A1A' },
  monthArrow: { fontSize: 18, color: '#666', paddingHorizontal: 8 },
  weekRow: { flexDirection: 'row', paddingHorizontal: 12 },
  weekDay: { flex: 1, textAlign: 'center', fontFamily: 'DMSans_600SemiBold', fontSize: 11, color: '#999', paddingVertical: 4 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 },
  calCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calCellSelected: { backgroundColor: '#FF6B35', borderRadius: 100 },
  calDayText: { fontFamily: 'DMSans_400Regular', fontSize: 13, color: '#1A1A1A' },
  calDayPast: { color: '#CCC' },
  calDaySelectedText: { color: '#FFF', fontFamily: 'DMSans_600SemiBold' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  timeInput: { width: 52, height: 44, backgroundColor: '#F5F5F5', borderRadius: 10, textAlign: 'center', fontFamily: 'DMSans_600SemiBold', fontSize: 18, color: '#1A1A1A' },
  timeSep: { fontSize: 20, color: '#333', fontFamily: 'DMSans_600SemiBold' },
  amPmBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F5F5' },
  amPmActive: { backgroundColor: '#FF6B35' },
  amPmText: { fontFamily: 'DMSans_600SemiBold', fontSize: 13, color: '#666' },
  amPmActiveText: { color: '#FFF' },
});
