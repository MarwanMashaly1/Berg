// [align-4] This screen is hidden from navigation — standalone group chats are off-product.
// See PRODUCT_NORTH_STAR.md. Re-enable if product scope changes.
// The file is preserved so the route continues to exist without crashing any deep links.

import { View } from 'react-native';

export default function NewGroupModal() {
  return <View />;
}

/* Original implementation preserved below — uncomment to restore:

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Colors, Fonts } from '../../../../constants/theme';
import { apiFetch, createGroupChat, getProfileConnections } from '../../../../lib/api';
import { Avatar } from '../../../../components/ui/Avatar';
import { BackButton } from '../../../../components/ui/BackButton';

const C = Colors.light;

type Person = { id: string; name: string | null; username: string | null };

function PersonRow({
  item,
  isSelected,
  onToggle,
}: {
  item: Person;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={styles.personRow} onPress={onToggle} activeOpacity={0.7}>
      <Avatar name={item.name} userId={item.id} size="md" />
      <View style={styles.personInfo}>
        <Text style={styles.personName}>{item.name ?? item.username ?? 'Unknown'}</Text>
        {item.username && <Text style={styles.personUsername}>@{item.username}</Text>}
      </View>
      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
        {isSelected && <MaterialIcons name="check" size={14} color={C.textInverse} />}
      </View>
    </TouchableOpacity>
  );
}

export default function NewGroupModal() {
  const insets = useSafeAreaInsets();
  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<Person[]>([]);
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Load confirmed connections on mount
  useEffect(() => {
    getProfileConnections()
      .then((data) => {
        setFriends(
          data.confirmed.map((c) => ({ id: c.id, name: c.name, username: null })),
        );
      })
      .catch(() => {})
      .finally(() => setLoadingFriends(false));
  }, []);

  // Search when query changes
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiFetch<{ users: Person[] }>(
          `/api/users/search?q=${encodeURIComponent(q)}`,
        );
        setSearchResults(data.users ?? []);
      } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = useCallback((person: Person) => {
    setSelected((prev) =>
      prev.some((p) => p.id === person.id)
        ? prev.filter((p) => p.id !== person.id)
        : [...prev, person],
    );
  }, []);

  async function handleCreate() {
    if (!groupName.trim()) { setError('Give your group a name.'); return; }
    if (selected.length === 0) { setError('Add at least one person.'); return; }
    setCreating(true);
    setError('');
    try {
      const { id } = await createGroupChat(groupName.trim(), selected.map((p) => p.id));
      router.replace({
        pathname: '/(app)/(tabs)/chat/[id]',
        params: { id, name: groupName.trim() },
      } as any);
    } catch {
      setError('Could not create group. Try again.');
      setCreating(false);
    }
  }

  const canCreate = groupName.trim().length > 0 && selected.length > 0;
  const isSearching = query.trim().length > 0;
  const displayList = isSearching ? searchResults : friends;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <BackButton variant="light" />
        <Text style={styles.headerTitle}>New Group Chat</Text>
        <TouchableOpacity
          style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!canCreate || creating}
        >
          {creating
            ? <ActivityIndicator size="small" color={C.textInverse} />
            : <Text style={styles.createBtnText}>Create</Text>}
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.nameInput}
        value={groupName}
        onChangeText={setGroupName}
        placeholder="Group name…"
        placeholderTextColor={C.textTertiary}
        maxLength={60}
        autoFocus
      />

      {selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map((p) => (
            <TouchableOpacity key={p.id} style={styles.chip} onPress={() => toggle(p)}>
              <Text style={styles.chipText}>{p.name?.split(' ')[0] ?? p.username}</Text>
              <MaterialIcons name="close" size={12} color={C.primary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={18} color={C.textTertiary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search all people…"
          placeholderTextColor={C.textTertiary}
        />
        {(searching || (loadingFriends && !isSearching)) && (
          <ActivityIndicator size="small" color={C.primary} />
        )}
      </View>

      {!isSearching && (
        <Text style={styles.sectionLabel}>
          {loadingFriends ? '' : friends.length > 0 ? 'YOUR CONNECTIONS' : ''}
        </Text>
      )}

      <FlatList
        data={displayList}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PersonRow
            item={item}
            isSelected={selected.some((p) => p.id === item.id)}
            onToggle={() => toggle(item)}
          />
        )}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loadingFriends && !isSearching ? null :
          isSearching && !searching ? (
            <Text style={styles.noResults}>No people found for "{query}"</Text>
          ) : !isSearching && friends.length === 0 ? (
            <View style={styles.emptyFriends}>
              <Text style={styles.emptyFriendsTitle}>No connections yet</Text>
              <Text style={styles.emptyFriendsSub}>
                Connect with people in Discovery to add them to a group.
              </Text>
            </View>
          ) : null
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 16, color: C.text },
  createBtn: { backgroundColor: C.primary, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  createBtnDisabled: { backgroundColor: C.border },
  createBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.textInverse },
  error: { fontFamily: Fonts.body, fontSize: 12, color: Colors.light.error, marginHorizontal: 16, marginTop: 8 },
  nameInput: {
    fontFamily: Fonts.body, fontSize: 15, color: C.text,
    borderBottomWidth: 1, borderBottomColor: C.border,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.primaryMuted, borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  chipText: { fontFamily: Fonts.body, fontSize: 13, color: C.primary },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 14, marginTop: 12, marginBottom: 4,
    backgroundColor: C.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontFamily: Fonts.body, fontSize: 14, color: C.text },
  sectionLabel: {
    fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.textTertiary,
    letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2,
  },
  personRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 11,
  },
  personInfo: { flex: 1 },
  personName: { fontFamily: Fonts.body, fontSize: 14, color: C.text },
  personUsername: { fontFamily: Fonts.body, fontSize: 12, color: C.textSecondary, marginTop: 1 },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: C.primary, borderColor: C.primary },
  noResults: { fontFamily: Fonts.body, fontSize: 13, color: C.textTertiary, textAlign: 'center', marginTop: 24 },
  emptyFriends: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 },
  emptyFriendsTitle: { fontFamily: Fonts.heading, fontSize: 17, color: C.text, marginBottom: 6, fontStyle: 'italic' },
  emptyFriendsSub: { fontFamily: Fonts.body, fontSize: 13, color: C.textSecondary, textAlign: 'center' },
});

*/
