import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../constants/theme';

// expo-contacts requires a native build — guard against missing native module
let Contacts: typeof import('expo-contacts') | null = null;
try {
  Contacts = require('expo-contacts');
} catch {
  // not available in this build — contact sync will be skipped
}
import { Avatar } from '../../components/ui/Avatar';
import { searchUsers, requestConnection, syncContacts, type UserSearchResult } from '../../lib/api';

const C = Colors.light;

function normalizePhone(raw: string): string | null {
  let cleaned = raw.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
  if (/^\+\d{7,15}$/.test(cleaned)) return cleaned;
  return null;
}

export default function FindFriendsScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [contactMatches, setContactMatches] = useState<UserSearchResult[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadContactMatches();
  }, []);

  async function loadContactMatches() {
    if (!Contacts) return; // native module not available in this build

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') return;

    setContactsLoading(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      const phones: string[] = [];
      for (const contact of data) {
        for (const pn of contact.phoneNumbers ?? []) {
          const e164 = normalizePhone(pn.number ?? '');
          if (e164) phones.push(e164);
        }
      }

      if (phones.length === 0) return;

      const res = await syncContacts(phones);
      setContactMatches(res.users);
    } catch {
      // silently fail — contacts are a best-effort feature
    } finally {
      setContactsLoading(false);
    }
  }

  const runSearch = useCallback((q: string) => {
    if (searchTimer) clearTimeout(searchTimer);
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchUsers(q.trim());
        setResults(res.users);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    setSearchTimer(t);
  }, [searchTimer]);

  function handleChange(text: string) {
    setQuery(text);
    runSearch(text);
  }

  async function handleConnect(userId: string) {
    try {
      await requestConnection(userId);
      setRequested((prev) => new Set(prev).add(userId));
    } catch { /* ignore */ }
  }

  function renderUser(item: UserSearchResult) {
    const isConnected = item.connectionStatus === 'confirmed';
    const isPending = item.connectionStatus === 'pending' || requested.has(item.id);

    return (
      <View style={styles.row}>
        <Avatar name={item.name ?? item.username} userId={item.id} uri={item.image ?? undefined} size="md" />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.name ?? 'Unknown'}</Text>
          {item.username && <Text style={styles.handle}>@{item.username}</Text>}
        </View>
        {isConnected ? (
          <View style={[styles.actionBtn, styles.connectedBtn]}>
            <Text style={styles.connectedText}>Friends</Text>
          </View>
        ) : isPending ? (
          <View style={[styles.actionBtn, styles.pendingBtn]}>
            <Text style={styles.pendingText}>Sent</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleConnect(item.id)} activeOpacity={0.75}>
            <Text style={styles.connectText}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const isSearching = query.trim().length >= 2;

  if (isSearching) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.backgroundWarm }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Find friends</Text>
        </View>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={handleChange}
            placeholder="Search by name or @handle"
            placeholderTextColor={C.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
          />
        </View>
        {loading && <ActivityIndicator color={C.primary} style={{ marginTop: 24 }} />}
        {!loading && results.length === 0 && (
          <Text style={styles.empty}>No users found for "{query}"</Text>
        )}
        <FlatList
          data={results}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => renderUser(item)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        />
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.backgroundWarm }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Find friends</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleChange}
          placeholder="Search by name or @handle"
          placeholderTextColor={C.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
      </View>

      {contactsLoading ? (
        <View style={styles.contactsLoadingWrap}>
          <ActivityIndicator color={C.primary} size="small" />
          <Text style={styles.contactsLoadingText}>Finding contacts on Berg…</Text>
        </View>
      ) : contactMatches.length > 0 ? (
        <>
          <Text style={styles.sectionHeader}>From your contacts</Text>
          <FlatList
            data={contactMatches}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => renderUser(item)}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          />
        </>
      ) : (
        <Text style={styles.empty}>None of your contacts are on Berg yet</Text>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 4,
  },
  back: { fontFamily: Fonts.body, fontSize: 14, color: C.textTertiary, marginBottom: 8 },
  title: { fontFamily: Fonts.heading, fontSize: 28, color: C.text, letterSpacing: -0.5 },

  searchWrap: {
    marginHorizontal: 20,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.body,
    fontSize: 16,
    color: C.text,
  },

  sectionHeader: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
  },

  contactsLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 32,
    justifyContent: 'center',
  },
  contactsLoadingText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.textTertiary,
  },

  empty: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.textTertiary,
    textAlign: 'center',
    marginTop: 32,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    gap: 12,
  },
  info: { flex: 1 },
  name: { fontFamily: Fonts.bodySemiBold, fontSize: 15, color: C.text },
  handle: { fontFamily: Fonts.body, fontSize: 13, color: C.textTertiary, marginTop: 1 },

  actionBtn: {
    backgroundColor: C.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  connectText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: '#fff' },
  connectedBtn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.border },
  connectedText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.textSecondary },
  pendingBtn: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.primaryMuted },
  pendingText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: C.primary },
});
