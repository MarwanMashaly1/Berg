import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentUser } from '../../../hooks/use-current-user';
import { C, Fonts } from '../../../constants/theme';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OnboardingProgress } from '../../../components/ui/OnboardingProgress';
import { BergSheet } from '../../../components/ui/BergSheet';
import { CircularCropModal } from '../../../components/ui/CircularCropModal';
import { patchUser, checkUsername } from '../../../lib/api';
import { trackOnboardingStep } from '../../../lib/analytics';
import {
  pickImageFromLibrary, takePhotoFromCamera,
  uploadAvatarFromUri, PickedImage,
} from '../../../lib/avatar';

export default function Step1() {
  const { user } = useCurrentUser();
  const [name, setName] = useState((user?.name ?? '') as string);
  const [username, setUsername] = useState((user as any)?.username ?? '');
  const [usernameError, setUsernameError] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>((user?.image ?? null) as string | null);
  const [pendingCrop, setPendingCrop] = useState<PickedImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sheetVisible, setSheetVisible] = useState(false);
  const insets = useSafeAreaInsets();

  async function handleUsernameBlur() {
    const val = username.toLowerCase().trim();
    if (!val) { setUsernameError(''); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(val)) {
      setUsernameError('3–20 characters: letters, numbers, underscores only');
      return;
    }
    setUsernameChecking(true);
    try {
      const { available } = await checkUsername(val);
      setUsernameError(available ? '' : 'That handle is already taken');
    } catch {
      // ignore network errors on blur check
    } finally {
      setUsernameChecking(false);
    }
  }

  async function handleLibrary() {
    setSheetVisible(false);
    const picked = await pickImageFromLibrary();
    if (picked) setPendingCrop(picked);
  }

  async function handleCamera() {
    setSheetVisible(false);
    const picked = await takePhotoFromCamera();
    if (picked) setPendingCrop(picked);
  }

  async function handleCropConfirm(croppedUri: string) {
    setPendingCrop(null);
    setUploading(true);
    setError('');
    try {
      const url = await uploadAvatarFromUri(croppedUri);
      if (url) setAvatarUri(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleNext() {
    const trimmed = name.trim();
    const handle = username.toLowerCase().trim();
    if (!trimmed) { setError('Please enter your name'); return; }
    if (handle && !/^[a-z0-9_]{3,20}$/.test(handle)) {
      setUsernameError('3–20 characters: letters, numbers, underscores only');
      return;
    }
    if (usernameError) return;
    setLoading(true);
    try {
      if (handle) {
        const { available } = await checkUsername(handle);
        if (!available) { setUsernameError('That handle is already taken'); setLoading(false); return; }
      }
      await patchUser({ name: trimmed, displayName: trimmed, ...(handle ? { username: handle } : {}), onboardingStep: '1' });
      trackOnboardingStep(1);
      router.push('/(app)/onboarding/step-2');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const initials = name.trim()
    ? name.trim().split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.backgroundWarm }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 28,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <OnboardingProgress currentStep={1} />
          </View>

          <Text style={styles.heading}>Let's set up{'\n'}your profile</Text>
          <View style={styles.rule} />
          <Text style={styles.sub}>Add a photo and tell us your name.</Text>

          {/* Avatar picker */}
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={() => setSheetVisible(true)}
            activeOpacity={0.8}
            disabled={uploading}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <View style={styles.cameraBody} />
              <View style={styles.cameraLens} />
            </View>
            {uploading && (
              <View style={styles.uploadingOverlay}>
                <Text style={styles.uploadingText}>Uploading…</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.photoHint}>Tap to add a photo (optional)</Text>

          <Input
            value={name}
            onChangeText={(t) => { setName(t); setError(''); }}
            placeholder="Your name"
            error={error}
            returnKeyType="next"
            containerStyle={{ marginTop: 24 }}
          />
          <Input
            value={username}
            onChangeText={(t) => { setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, '')); setUsernameError(''); }}
            onBlur={handleUsernameBlur}
            placeholder="@handle (optional)"
            error={usernameError}
            hint={usernameChecking ? 'Checking…' : undefined}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleNext}
            containerStyle={{ marginTop: 12 }}
          />

          <Button
            label="Next"
            onPress={handleNext}
            loading={loading}
            disabled={!name.trim() || uploading}
            fullWidth
            size="lg"
            style={styles.btn}
            textStyle={{ color: '#fff', fontFamily: Fonts.bodySemiBold }}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <BergSheet
        visible={sheetVisible}
        title="Add photo"
        onDismiss={() => setSheetVisible(false)}
        options={[
          { label: 'Take photo', onPress: handleCamera },
          { label: 'Choose from library', onPress: handleLibrary },
        ]}
      />

      {pendingCrop && (
        <CircularCropModal
          visible
          imageUri={pendingCrop.uri}
          imageWidth={pendingCrop.width}
          imageHeight={pendingCrop.height}
          onConfirm={handleCropConfirm}
          onCancel={() => setPendingCrop(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 28 },
  heading: {
    fontFamily: Fonts.heading,
    fontSize: 36,
    fontStyle: 'italic',
    color: C.text,
    lineHeight: 42,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  rule: { width: 32, height: 2, backgroundColor: C.primary, borderRadius: 2, marginBottom: 14 },
  sub: { fontFamily: Fonts.body, fontSize: 15, color: C.textSecondary, lineHeight: 22, marginBottom: 28 },

  avatarWrap: {
    alignSelf: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    backgroundColor: C.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 28,
    color: C.primary,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.primary,
    borderWidth: 2.5,
    borderColor: C.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBody: {
    width: 12,
    height: 9,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: '#fff',
    position: 'absolute',
  },
  cameraLens: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: '#fff',
  },
  photoHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: C.textTertiary,
    textAlign: 'center',
    marginBottom: 8,
  },

  btn: { backgroundColor: C.text, borderRadius: 14, marginTop: 32 },
});
