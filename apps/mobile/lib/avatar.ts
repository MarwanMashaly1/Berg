import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { apiFetch, patchUser } from './api';

/**
 * Open the image picker, compress the selected image, upload it to Supabase Storage,
 * and save the public URL to the user's profile.
 *
 * Returns the new avatar public URL on success, null if the user cancelled or on error.
 */
export async function pickAndUploadAvatar(): Promise<string | null> {
  // Request media library permission
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  // Launch picker — square crop, single image
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1, // we compress ourselves below
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];

  // Compress and resize to 500×500 JPEG
  const compressed = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: 500, height: 500 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );

  // Get signed upload URL from server
  const { uploadUrl, publicUrl } = await apiFetch<{
    uploadUrl: string;
    path: string;
    publicUrl: string;
  }>('/api/users/me/avatar-upload-url', {
    method: 'POST',
    body: JSON.stringify({ ext: 'jpg', contentType: 'image/jpeg' }),
  });

  // Upload the compressed image to Supabase Storage
  const fileResponse = await fetch(compressed.uri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });

  if (!uploadResponse.ok) {
    console.error('[avatar] Upload failed:', uploadResponse.status);
    return null;
  }

  // Save the public URL to the user profile
  await patchUser({ image: publicUrl });

  return publicUrl;
}

/**
 * Open the camera and take a photo, then upload it as the user's avatar.
 * Returns the new avatar public URL on success, null if cancelled or on error.
 */
export async function takeAndUploadAvatar(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];

  const compressed = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: 500, height: 500 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );

  const { uploadUrl, publicUrl } = await apiFetch<{
    uploadUrl: string;
    path: string;
    publicUrl: string;
  }>('/api/users/me/avatar-upload-url', {
    method: 'POST',
    body: JSON.stringify({ ext: 'jpg', contentType: 'image/jpeg' }),
  });

  const fileResponse = await fetch(compressed.uri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });

  if (!uploadResponse.ok) return null;

  await patchUser({ image: publicUrl });
  return publicUrl;
}
