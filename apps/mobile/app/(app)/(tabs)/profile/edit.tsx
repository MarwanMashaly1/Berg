import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, StyleSheet, Alert, Image, ActionSheetIOS,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentUser } from '../../../../hooks/use-current-user';
import { C, Fonts } from '../../../../constants/theme';
import { Routes } from '../../../../lib/routes';
import { patchUser, getUserMe } from '../../../../lib/api';
import { pickAndUploadAvatar, takeAndUploadAvatar } from '../../../../lib/avatar';
import { log } from '../../../../lib/logger';

const AVAIL_OPTIONS = [
  { value: 'down_to_hang', emoji: '🟢', label: 'Down to hang', color: '#2D6A4F', bg: 'rgba(45,106,79,0.12)' },
  { value: 'ask_me',       emoji: '🟡', label: 'Ask me',       color: '#B7791F', bg: 'rgba(183,121,31,0.12)' },
  { value: 'busy',         emoji: '🔴', label: 'Busy',         color: '#C53030', bg: 'rgba(197,48,48,0.10)' },
];

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useCurrentUser();
  const user = currentUser as any;

  const [name, setName] = useState<string>(user?.displayName ?? user?.name ?? '');
  const [username, setUsername] = useState<string>(user?.username ?? '');
  const [bio, setBio] = useState<string>(user?.bio ?? '');
  const [availability, setAvailability] = useState<string>(user?.availabilityStatus ?? 'down_to_hang');
  const [avatarUri, setAvatarUri] = useState<string | null>((user?.image ?? null) as string | null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getUserMe().then(({ user: u }) => {
      if (!u) return;
      setName(u.displayName ?? u.name ?? '');
      setUsername(u.username ?? '');
      setBio(u.bio ?? '');
      setAvailability(u.availabilityStatus ?? 'down_to_hang');
      if (u.image) setAvatarUri(u.image);
    }).catch((err) => { log.error('profile load failed', err); Alert.alert('Something went wrong', 'Please try again.'); });
  }, []);

  function showAvatarPicker() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take photo', 'Choose from library'], cancelButtonIndex: 0 },
        async (index) => {
          if (index === 1) await handleCameraUpload();
          if (index === 2) await handleLibraryUpload();
        },
      );
    } else {
      Alert.alert('Change photo', undefined, [
        { text: 'Take photo', onPress: handleCameraUpload },
        { text: 'Choose from library', onPress: handleLibraryUpload },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  async function handleLibraryUpload() {
    setUploading(true);
    try {
      const url = await pickAndUploadAvatar();
      if (url) setAvatarUri(url);
    } catch { Alert.alert('Upload failed', 'Please try again.'); }
    finally { setUploading(false); }
  }

  async function handleCameraUpload() {
    setUploading(true);
    try {
      const url = await takeAndUploadAvatar();
      if (url) setAvatarUri(url);
    } catch { Alert.alert('Upload failed', 'Please try again.'); }
    finally { setUploading(false); }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Display name is required'); return; }
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError('Username must be 3–20 chars, letters/numbers/underscores only');
      return;
    }
    setSaving(true); setError('');
    try {
      await patchUser({ displayName: name.trim(), name: name.trim(), username: username || undefined, bio: bio || undefined, availabilityStatus: availability });
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setSaving(false); }
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={styles.title}>Edit profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[styles.save, saving && { opacity: 0.5 }]}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={styles.avatarSection}
            onPress={showAvatarPicker}
            activeOpacity={0.8}
            disabled={uploading}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontFamily: Fonts.bodySemiBold, fontSize: 28, color: C.primary }}>
                  {name ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?'}
                </Text>
              </View>
            )}
            <View style={styles.editBadge}>
              {/* Camera lens drawn with views */}
              <View style={{ width: 9, height: 7, borderRadius: 1.5, borderWidth: 1.5, borderColor: '#fff', position: 'absolute' }} />
              <View style={{ width: 4, height: 4, borderRadius: 2, borderWidth: 1.5, borderColor: '#fff' }} />
            </View>
            {uploading ? (
              <Text style={[styles.changePhoto, { color: C.textTertiary }]}>Uploading…</Text>
            ) : (
              <Text style={styles.changePhoto}>Change photo</Text>
            )}
          </TouchableOpacity>
          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
              <TextInput style={styles.fieldInput} value={name} onChangeText={setName} maxLength={50} placeholder="Your name" placeholderTextColor={C.textTertiary} />
            </View>
            <View style={[styles.field, styles.fieldBorder]}>
              <Text style={styles.fieldLabel}>USERNAME</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={{ fontFamily: Fonts.body, fontSize: 13, color: '#b0a090' }}>@</Text>
                <TextInput style={[styles.fieldInput, { flex: 1 }]} value={username} onChangeText={setUsername} maxLength={20} autoCapitalize="none" placeholder="username" placeholderTextColor={C.textTertiary} />
              </View>
            </View>
            <View style={[styles.field, styles.fieldBorder, { borderBottomWidth: 0 }]}>
              <Text style={styles.fieldLabel}>BIO</Text>
              <TextInput style={[styles.fieldInput, { minHeight: 36 }]} value={bio} onChangeText={setBio} maxLength={150} multiline placeholder="Tell people about yourself…" placeholderTextColor={C.textTertiary} />
            </View>
          </View>
          <Text style={styles.sectionLabel}>AVAILABILITY</Text>
          <View style={styles.availRow}>
            {AVAIL_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.value} style={[styles.availOption, availability === opt.value && { backgroundColor: opt.bg, borderColor: opt.color }]} onPress={() => setAvailability(opt.value)}>
                <Text style={{ fontSize: 16 }}>{opt.emoji}</Text>
                <Text style={[styles.availLabel, availability === opt.value && { color: opt.color }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.sectionLabel}>VIBE TAGS</Text>
          <TouchableOpacity style={styles.vibeRow} onPress={() => router.push(Routes.onboardingEditVibes)}>
            <Text style={{ fontFamily: Fonts.body, fontSize: 12, color: C.text, flex: 1 }}>Edit your interests</Text>
            <Text style={{ fontFamily: Fonts.bodySemiBold, fontSize: 11, color: C.primary }}>Edit →</Text>
          </TouchableOpacity>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.backgroundWarm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 10 },
  cancel: { fontFamily: Fonts.body, fontSize: 14, color: '#b0a090' },
  title: { fontFamily: Fonts.heading, fontSize: 17, color: C.text, fontStyle: 'italic' },
  save: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: C.primary },
  scroll: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', marginBottom: 20, position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primaryMuted },
  editBadge: { position: 'absolute', bottom: 22, right: '50%', marginRight: -44, width: 24, height: 24, backgroundColor: C.primary, borderRadius: 12, borderWidth: 2, borderColor: C.backgroundWarm, alignItems: 'center', justifyContent: 'center' },
  changePhoto: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: C.primary, marginTop: 6 },
  card: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  field: { padding: 12 },
  fieldBorder: { borderTopWidth: 1, borderTopColor: C.borderWarm },
  fieldLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: C.textTertiary, letterSpacing: 0.5, marginBottom: 4 },
  fieldInput: { fontFamily: Fonts.body, fontSize: 13, color: C.text, padding: 0 },
  sectionLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: C.textTertiary, letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  availRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  availOption: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, gap: 4 },
  availLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: C.textTertiary, textAlign: 'center' },
  vibeRow: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  error: { fontFamily: Fonts.body, fontSize: 12, color: C.error, textAlign: 'center', marginTop: 8 },
});
