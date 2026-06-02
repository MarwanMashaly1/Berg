import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, Fonts } from '../../constants/theme';

// expo-contacts requires a native build — guard against missing native module
let Contacts: typeof import('expo-contacts') | null = null;
try {
  Contacts = require('expo-contacts');
} catch {
  // not available in this build — contact sync will be skipped
}
import { Avatar } from '../../components/ui/Avatar';
import { BackButton } from '../../components/ui/BackButton';
import { searchUsers, requestConnection, syncContacts, type UserSearchResult } from '../../lib/api';

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
  const [contactsStatus, setContactsStatus] = useState<'idle' | 'no-module' | 'no-permission' | 'synced' | 'error'>('idle');
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const openedSettings = useRef(false);

  useEffect(() => {
    loadContactMatches();
  }, []);

  // Re-run sync when returning from system Settings after granting permission
  useFocusEffect(useCallback(() => {
    if (openedSettings.current) {
      openedSettings.current = false;
      loadContactMatches();
    }
  }, []));

  async function loadContactMatches() {
    if (!Contacts) {
      setContactsStatus('no-module');
      return;
    }

    setContactsLoading(true);
    setContactsStatus('idle');
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setContactsStatus('no-permission');
        return;
      }

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

      const res = phones.length > 0 ? await syncContacts(phones) : { users: [] };
      setContactMatches(res.users);
      setContactsStatus('synced');
    } catch {
      setContactsStatus('error');
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
    } catch (err) {
      console.error('[find-friends] connect failed:', err);
      Alert.alert('Could not send request', 'Please try again.');
    }
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
          <BackButton />
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
        <BackButton />
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
          <Text style={styles.contactsLoadingText}>Syncing your contacts…</Text>
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
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>
            {contactsStatus === 'no-module'
              ? 'Contact sync needs a new build — tap below to rebuild'
              : contactsStatus === 'no-permission'
              ? 'Allow contacts permission in Settings to find friends'
              : contactsStatus === 'synced'
              ? 'None of your contacts are on Berg yet'
              : contactsStatus === 'error'
              ? 'Something went wrong syncing contacts'
              : 'Checking your contacts…'}
          </Text>
          {contactsStatus === 'no-permission' ? (
            <TouchableOpacity onPress={() => { openedSettings.current = true; Linking.openSettings(); }} style={styles.retryBtn}>
              <Text style={styles.retryText}>Open Settings</Text>
            </TouchableOpacity>
          ) : contactsStatus === 'error' ? (
            <TouchableOpacity onPress={loadContactMatches} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
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

  emptyWrap: {
    alignItems: 'center',
    marginTop: 32,
    paddingHorizontal: 32,
    gap: 12,
  },
  empty: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: C.textTertiary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  retryText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: C.textSecondary,
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
